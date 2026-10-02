import { redis } from 'bun'
import {
	QUOTA_PER_MINUTE_NODE,
	QUOTA_PER_MINUTE_TOKEN,
	QUOTA_WINDOW_MS,
} from './config'

export interface QuotaState {
	used: number
	remaining: number
	reset_at: string
}

function bucketKey(
	prefix: string,
	id: number | string
): { key: string; resetAt: number } {
	const bucket = Math.floor(Date.now() / QUOTA_WINDOW_MS)
	return {
		key: `sc:quota:${prefix}:${id}:${bucket}`,
		resetAt: (bucket + 1) * QUOTA_WINDOW_MS,
	}
}

const memFallback = new Map<string, { used: number; resetAt: number }>()

function memGet(key: string, resetAt: number): number {
	const entry = memFallback.get(key)
	if (!entry || entry.resetAt <= Date.now()) {
		memFallback.set(key, { used: 0, resetAt })
		return 0
	}
	return entry.used
}

function emptyState(limit: number, used: number, resetAt: number): QuotaState {
	return {
		used,
		remaining: Math.max(0, limit - used),
		reset_at: new Date(resetAt).toISOString(),
	}
}

export async function peekQuota(
	prefix: string,
	id: number | string,
	limit: number
): Promise<QuotaState> {
	const { key, resetAt } = bucketKey(prefix, id)
	try {
		const raw = await redis.get(key)
		return emptyState(limit, raw ? Number(raw) : 0, resetAt)
	} catch {
		return emptyState(limit, memGet(key, resetAt), resetAt)
	}
}

export async function tryReserveQuota(
	prefix: string,
	id: number | string,
	cost: number,
	limit: number
): Promise<{ ok: boolean } & QuotaState> {
	const { key, resetAt } = bucketKey(prefix, id)
	try {
		const used = await redis.incrby(key, cost)
		if (used === cost) {
			await redis.expire(key, 70)
		}
		if (used > limit) {
			await redis.decrby(key, cost)
			return { ok: false, ...emptyState(limit, used - cost, resetAt) }
		}
		return { ok: true, ...emptyState(limit, used, resetAt) }
	} catch {
		const used = memGet(key, resetAt) + cost
		if (used > limit) {
			return { ok: false, ...emptyState(limit, used - cost, resetAt) }
		}
		memFallback.set(key, { used, resetAt })
		return { ok: true, ...emptyState(limit, used, resetAt) }
	}
}

export async function releaseQuota(
	prefix: string,
	id: number | string,
	cost: number
): Promise<void> {
	const { key } = bucketKey(prefix, id)
	try {
		const used = await redis.decrby(key, cost)
		if (used <= 0) await redis.del(key)
	} catch {
		const entry = memFallback.get(key)
		if (entry) {
			entry.used = Math.max(0, entry.used - cost)
		}
	}
}

export const peekUsage = (tokenId: number | string): Promise<QuotaState> =>
	peekQuota('token', tokenId, QUOTA_PER_MINUTE_TOKEN)

export const tryReserve = (
	tokenId: number | string,
	cost: number
): Promise<{ ok: boolean } & QuotaState> =>
	tryReserveQuota('token', tokenId, cost, QUOTA_PER_MINUTE_TOKEN)

export const release = (
	tokenId: number | string,
	cost: number
): Promise<void> => releaseQuota('token', tokenId, cost)


export const peekNodeUsage = (nodeId: number | string): Promise<QuotaState> =>
	peekQuota('node', nodeId, QUOTA_PER_MINUTE_NODE)

export const tryReserveNode = (
	nodeId: number | string,
	cost: number
): Promise<{ ok: boolean } & QuotaState> =>
	tryReserveQuota('node', nodeId, cost, QUOTA_PER_MINUTE_NODE)

export const releaseNode = (
	nodeId: number | string,
	cost: number
): Promise<void> => releaseQuota('node', nodeId, cost)
