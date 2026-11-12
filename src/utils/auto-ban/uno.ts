import { redis } from 'bun'
import { env } from '@/env'
import { blockIp, isIpBlocked } from './index'
import {
	type AdminAlertField,
	DiscordEmbedColors,
	notifyAdmins,
} from './notify'

const UNO_HITS_WINDOW_SECONDS = 24 * 60 * 60
export const UNO_HITS_KEY_PREFIX = 'uno-ip-hits:'
export const UNO_MANUAL_BAN_KEY_PREFIX = 'uno-manual-ban:'

const UNO_IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/
const UNO_IPV4_MAPPED_PATTERN = /^::ffff:\d{1,3}(\.\d{1,3}){3}$/i
const UNO_IPV6_PATTERN = /^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){1,7}$/i

export function isValidIp(ip: string): boolean {
	if (!ip || ip.length > 45) return false
	if (UNO_IPV4_MAPPED_PATTERN.test(ip)) {
		return isValidIp(ip.slice('::ffff:'.length))
	}
	if (UNO_IPV4_PATTERN.test(ip)) {
		return ip.split('.').every((part) => {
			if (part.length > 1 && part.startsWith('0')) return false
			return Number(part) <= 255
		})
	}
	return ip.includes(':') && UNO_IPV6_PATTERN.test(ip)
}

export function shouldBlockForViolations(
	count: number,
	threshold: number
): boolean {
	return threshold > 0 && Number.isFinite(count) && count > threshold
}

export type UnoManualBan = {
	reason: string
	banned_at: string
	banned_by: string | null
}

function parseManualBan(raw: string | null): UnoManualBan | null {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as Partial<UnoManualBan>
		if (
			typeof parsed.reason !== 'string' ||
			typeof parsed.banned_at !== 'string'
		) {
			return null
		}
		return {
			reason: parsed.reason,
			banned_at: parsed.banned_at,
			banned_by:
				typeof parsed.banned_by === 'string' ? parsed.banned_by : null,
		}
	} catch {
		return null
	}
}

export async function getUnoManualBan(
	ip: string
): Promise<UnoManualBan | null> {
	if (!ip) return null
	try {
		return parseManualBan(
			await redis.get(`${UNO_MANUAL_BAN_KEY_PREFIX}${ip}`)
		)
	} catch {
		return null
	}
}

export async function isUnoManuallyBanned(ip: string): Promise<boolean> {
	if (!ip) return false
	try {
		return (await redis.get(`${UNO_MANUAL_BAN_KEY_PREFIX}${ip}`)) !== null
	} catch {
		return false
	}
}

export async function banIpManually(
	ip: string,
	reason: string,
	bannedBy: string | null
): Promise<UnoManualBan> {
	const record: UnoManualBan = {
		reason,
		banned_at: new Date().toISOString(),
		banned_by: bannedBy,
	}
	await redis.set(`${UNO_MANUAL_BAN_KEY_PREFIX}${ip}`, JSON.stringify(record))
	return record
}

export async function unbanIpManually(ip: string): Promise<void> {
	await redis.del(`${UNO_MANUAL_BAN_KEY_PREFIX}${ip}`)
}

export async function recordUnoHit(ip: string): Promise<void> {
	if (!ip) return
	try {
		const key = `${UNO_HITS_KEY_PREFIX}${ip}`
		const count = await redis.incr(key)
		if (count === 1) {
			await redis.expire(key, UNO_HITS_WINDOW_SECONDS)
		}
	} catch (err) {
		console.error('[AutoBan] recordUnoHit failed:', err)
	}
}

export function unoErrorStatus(status: unknown): number {
	if (typeof status === 'number') return status
	if (typeof status === 'string') {
		const parsed = Number(status)
		if (Number.isFinite(parsed)) return parsed
	}
	return 0
}

export async function recordUnoAbuse(
	ip: string,
	info: { route: string; status: number }
): Promise<void> {
	if (!ip || env.UNO_ABUSE_MAX_VIOLATIONS <= 0) return
	try {
		const key = `uno-abuse:${ip}`
		const count = await redis.incr(key)
		if (count === 1) {
			await redis.expire(key, env.UNO_ABUSE_WINDOW_SECONDS)
		}
		if (
			shouldBlockForViolations(count, env.UNO_ABUSE_MAX_VIOLATIONS) &&
			!(await isIpBlocked(ip))
		) {
			await blockIp(
				ip,
				`uno abuse (${count} violations, e.g. ${info.route} ${info.status})`
			)
			const fields: AdminAlertField[] = [
				{ name: 'IP', value: ip, inline: true },
				{ name: 'Route', value: info.route, inline: true },
				{ name: 'Status', value: String(info.status), inline: true },
				{ name: 'Violations', value: String(count), inline: true },
			]
			await notifyAdmins({
				title: 'UNO autoban: IP заблокирован',
				description:
					'Превышен лимит ошибочных запросов к UNO API — IP заблокирован автоматически.',
				color: DiscordEmbedColors.ban,
				fields,
			})
			console.log(
				`[AutoBan] UNO abuse: IP ${ip} blocked (${count} violations)`
			)
		}
	} catch (err) {
		console.error('[AutoBan] recordUnoAbuse failed:', err)
	}
}
