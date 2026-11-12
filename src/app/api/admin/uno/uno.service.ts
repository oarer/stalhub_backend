import { redis } from 'bun'
import { unoManualBansTotal } from '@/app/api/metrics'
import { isIpBlocked } from '@/utils/auto-ban'
import {
	banIpManually,
	getUnoManualBan,
	UNO_HITS_KEY_PREFIX,
	UNO_MANUAL_BAN_KEY_PREFIX,
	type UnoManualBan,
} from '@/utils/auto-ban/uno'

export type UnoIpStatItem = {
	ip: string
	hits: number
	auto_blocked: boolean
	manual_banned: boolean
}

export type UnoBanItem = {
	ip: string
	reason: string
	banned_at: string
	banned_by: string | null
}

export function sortIpStats(items: UnoIpStatItem[]): UnoIpStatItem[] {
	return [...items].sort((a, b) => b.hits - a.hits)
}

async function scanKeys(pattern: string): Promise<string[]> {
	try {
		const keys: string[] = []
		let cursor = '0'
		do {
			const [next, batch] = await redis.scan(
				cursor,
				'MATCH',
				pattern,
				'COUNT',
				500
			)
			keys.push(...batch)
			cursor = next
		} while (cursor !== '0')
		return keys
	} catch (err) {
		console.error('[AdminUno] Failed to scan keys:', err)
		return []
	}
}

export async function listUnoIpStats(take: number): Promise<{
	generated_at: string
	window_hours: number
	total_ips: number
	items: UnoIpStatItem[]
}> {
	const [hitKeys, banKeys] = await Promise.all([
		scanKeys(`${UNO_HITS_KEY_PREFIX}*`),
		scanKeys(`${UNO_MANUAL_BAN_KEY_PREFIX}*`),
	])

	const manualBanned = new Set(
		banKeys.map((key) => key.slice(UNO_MANUAL_BAN_KEY_PREFIX.length))
	)
	const ips = new Set<string>()
	for (const key of hitKeys) ips.add(key.slice(UNO_HITS_KEY_PREFIX.length))
	for (const ip of manualBanned) ips.add(ip)

	const items: UnoIpStatItem[] = []
	for (const ip of ips) {
		const [hitsRaw, autoBlocked] = await Promise.all([
			redis.get(`${UNO_HITS_KEY_PREFIX}${ip}`).catch(() => null),
			isIpBlocked(ip),
		])
		items.push({
			ip,
			hits: hitsRaw ? parseInt(hitsRaw, 10) || 0 : 0,
			auto_blocked: autoBlocked,
			manual_banned: manualBanned.has(ip),
		})
	}

	const sorted = sortIpStats(items)
	return {
		generated_at: new Date().toISOString(),
		window_hours: 24,
		total_ips: sorted.length,
		items: sorted.slice(0, take),
	}
}

export async function listUnoBans(): Promise<{ items: UnoBanItem[] }> {
	const keys = await scanKeys(`${UNO_MANUAL_BAN_KEY_PREFIX}*`)
	const items: UnoBanItem[] = []
	for (const key of keys) {
		const ip = key.slice(UNO_MANUAL_BAN_KEY_PREFIX.length)
		const record: UnoManualBan | null = await getUnoManualBan(ip)
		if (!record) continue
		items.push({ ip, ...record })
	}
	items.sort((a, b) => b.banned_at.localeCompare(a.banned_at))
	return { items }
}

export async function banUnoIp(
	ip: string,
	reason: string,
	banned_by: string | null
): Promise<UnoBanItem> {
	const record = await banIpManually(ip, reason, banned_by)
	unoManualBansTotal.inc({ action: 'ban' })
	return { ip, ...record }
}

export async function unbanUnoIp(ip: string): Promise<void> {
	const removed = await redis
		.del(`${UNO_MANUAL_BAN_KEY_PREFIX}${ip}`)
		.catch(() => 0)
	if (removed > 0) {
		unoManualBansTotal.inc({ action: 'unban' })
	}
}
