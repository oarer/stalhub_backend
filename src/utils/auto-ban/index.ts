import { redis } from 'bun'
import type { Prisma } from 'generated/prisma/client'
import {
	abuseWarningsTotal,
	autoBansTotal,
	ipBlocksTotal,
} from '@/app/api/metrics'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { getUserMaxRank } from '@/utils/auth.guard'
import {
	type AdminAlertField,
	DiscordEmbedColors,
	notifyAdmins,
} from './notify'

export const AUTO_BAN_REASON =
	'Аккаунт заблокирован, пока мы проводим расследование. Обратитесь в службу поддержки'

export type AbuseRule = 'request_abuse' | 'content_spam'

const RPS_WINDOW_SECONDS = 3
const IP_HITS_TTL_SECONDS = 7 * 24 * 60 * 60

export function clientIp(
	headers: Record<string, string | undefined>,
	fallback = ''
): string {
	return (
		headers['x-forwarded-for']?.split(',')[0]?.trim() ||
		headers['x-real-ip'] ||
		fallback
	)
}

function metaFields(meta?: Prisma.InputJsonValue): AdminAlertField[] {
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return []
	return Object.entries(meta).map(([name, value]) => ({
		name,
		value: String(value),
		inline: true,
	}))
}

async function userLabel(user_id: number): Promise<string> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
			select: { username: true },
		})
		return user?.username ? `@${user.username}` : `#${user_id}`
	} catch {
		return `#${user_id}`
	}
}

export async function handleAccountViolation(
	user_id: number,
	rule: AbuseRule,
	meta?: Prisma.InputJsonValue
): Promise<'warn' | 'ban' | 'skip'> {
	if (!Number.isInteger(user_id)) return 'skip'

	const rank = await getUserMaxRank(user_id)

	const commonFields: AdminAlertField[] = [
		{ name: 'User', value: await userLabel(user_id), inline: true },
		{ name: 'User ID', value: String(user_id), inline: true },
		{ name: 'Rank', value: String(rank), inline: true },
		{ name: 'Rule', value: rule, inline: true },
		...metaFields(meta),
	]

	if (rank >= env.AUTO_BAN_SKIP_RANK) {
		await notifyAdmins({
			title: 'rank-защита, нужна ручная проверка',
			description:
				'Пользователь с высоким рейтингом нарушил правило, но автоматически не заблокирован.',
			color: DiscordEmbedColors.skip,
			fields: commonFields,
		})
		return 'skip'
	}

	const settings = await prisma.userSettings.upsert({
		where: { user_id },
		update: {},
		create: { user_id },
	})

	if (settings.auto_banned) return 'skip'

	if (!settings.auto_warned) {
		await prisma.$transaction([
			prisma.userSettings.update({
				where: { user_id },
				data: { auto_warned: true },
			}),
			prisma.banLog.create({
				data: {
					user_id,
					rule,
					severity: 'WARN',
					reason: 'Автоматическое предупреждение',
					meta: meta ?? undefined,
				},
			}),
		])
		abuseWarningsTotal.inc({ rule })
		console.log(`[AutoBan] WARN user ${user_id} (${rule})`)
		await notifyAdmins({
			title: 'Предупреждение (1/2)',
			description: 'Следующая сработка - перманентная блокировка.',
			color: DiscordEmbedColors.warn,
			fields: commonFields,
		})
		return 'warn'
	}

	await prisma.$transaction([
		prisma.userSettings.update({
			where: { user_id },
			data: {
				auto_banned: true,
				banned: true,
				ban_reason: AUTO_BAN_REASON,
				ban_expires_at: null,
			},
		}),
		prisma.banLog.create({
			data: {
				user_id,
				rule,
				severity: 'BAN',
				reason: AUTO_BAN_REASON,
				meta: meta ?? undefined,
			},
		}),
	])
	autoBansTotal.inc({ rule })
	console.log(`[AutoBan] BAN user ${user_id} (${rule})`)
	await notifyAdmins({
		title: 'Пользователь заблокирован',
		description: AUTO_BAN_REASON,
		color: DiscordEmbedColors.ban,
		fields: commonFields,
	})
	return 'ban'
}

function blockDurationSeconds(hits: number): number {
	const dur = env.IP_BLOCK_MIN_SECONDS * 2 ** (hits - 1)
	return Math.min(dur, env.IP_BLOCK_MAX_SECONDS)
}

export async function isIpBlocked(ip: string): Promise<boolean> {
	if (!ip) return false
	try {
		return (await redis.get(`ip-block:${ip}`)) !== null
	} catch {
		return false
	}
}

export async function blockIp(ip: string, reason: string): Promise<void> {
	if (!ip) return
	try {
		const hitsKey = `ip-block-hits:${ip}`
		const raw = await redis.get(hitsKey)
		const hits = (raw ? parseInt(raw, 10) : 0) + 1
		await redis.set(
			hitsKey,
			String(hits),
			'EX',
			String(IP_HITS_TTL_SECONDS)
		)
		const seconds = blockDurationSeconds(hits)
		await redis.set(`ip-block:${ip}`, reason, 'EX', String(seconds))
		ipBlocksTotal.inc()
		console.log(
			`[AutoBan] IP ${ip} blocked for ${seconds}s (${reason}), hit #${hits}`
		)
	} catch (err) {
		console.error('[AutoBan] Failed to block IP:', err)
	}
}

const RPS_SKIP_PREFIXES = [
	'/api/v1/health',
	'/api/v1/metrics',
	'/uploads/',
	'/swagger',
]

export function shouldSkipRps(pathname: string): boolean {
	return RPS_SKIP_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function enforceRateLimit(
	ip: string,
	normalizedRoute: string
): Promise<boolean> {
	if (!ip || env.RPS_THRESHOLD <= 0) return false

	if (await isIpBlocked(ip)) return true

	try {
		const bucket = `rps:${normalizedRoute}:${ip}:${Math.floor(Date.now() / 1000)}`
		const count = await redis.incr(bucket)
		if (count === 1) {
			await redis.expire(bucket, RPS_WINDOW_SECONDS)
		}
		if (count > env.RPS_THRESHOLD && !(await isIpBlocked(ip))) {
			await blockIp(ip, `rps>${env.RPS_THRESHOLD} on ${normalizedRoute}`)
		}
	} catch {
		return false
	}
	return (await isIpBlocked(ip)) ? true : false
}

const CONTENT_SPAM_WINDOW_SECONDS = 3600

export const SPAM_LIMIT_COMMENT = 5
export const SPAM_LIMIT_BUILD = 10
export const SPAM_LIMIT_ARTICLE = 10
export const SPAM_LIMIT_ART = 10

export async function enforceContentSpam(
	user_id: number,
	limit: number
): Promise<'ok' | 'warn' | 'ban' | 'skip'> {
	if (!Number.isInteger(user_id) || limit <= 0) return 'ok'
	try {
		const bucket = Math.floor(
			Date.now() / (CONTENT_SPAM_WINDOW_SECONDS * 1000)
		)
		const key = `content-spam:${user_id}:${bucket}`
		const count = await redis.incr(key)
		if (count === 1) {
			await redis.expire(key, CONTENT_SPAM_WINDOW_SECONDS)
		}
		if (count >= limit) {
			await redis.set(key, '0', 'EX', String(CONTENT_SPAM_WINDOW_SECONDS))
			return handleAccountViolation(user_id, 'content_spam', {
				limit,
				window_count: count,
			})
		}
	} catch (err) {
		console.error('[AutoBan] enforceContentSpam failed:', err)
	}
	return 'ok'
}

export async function recordLoginFailure(
	username: string,
	ip: string
): Promise<void> {
	if (!username || !ip || env.LOGIN_MAX_FAILURES <= 0) return
	try {
		const key = `login-fail:${username}:${ip}`
		const count = await redis.incr(key)
		if (count === 1) {
			await redis.expire(key, 10 * 60)
		}
		if (count > env.LOGIN_MAX_FAILURES && !(await isIpBlocked(ip))) {
			await blockIp(ip, `login bruteforce (${username})`)
		}
	} catch (err) {
		console.error('[AutoBan] Failed to record login failure:', err)
	}
}

export async function clearLoginFailures(
	username: string,
	ip: string
): Promise<void> {
	if (!username || !ip) return
	try {
		await redis.del(`login-fail:${username}:${ip}`)
	} catch {}
}
