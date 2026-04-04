import { redis } from 'bun'
import type { CacheData, ItemResult } from '@/types/arsenal.type'

const CACHE_KEY = 'arsenal:data'
const UPDATED_KEY = 'arsenal:updated_at'
const LOCK_KEY = 'arsenal:lock'

const TTL = 60 * 60 * 6
const STALE_TIME = 60 * 30
const LOCK_TTL = 60 * 5


const acquireLock = async () => {
	return (
		(await redis.set(LOCK_KEY, '1', 'NX', 'EX', LOCK_TTL.toString())) ===
		'OK'
	)
}

const releaseLock = async () => {
	await redis.del(LOCK_KEY)
}

export const shouldRevalidate = (updatedAt: Date | null) => {
	if (!updatedAt) return true
	return Date.now() - updatedAt.getTime() > STALE_TIME * 1000
}

export const getCache = async (): Promise<CacheData | null> => {
	const [data, updated] = await Promise.all([
		redis.get(CACHE_KEY),
		redis.get(UPDATED_KEY),
	])

	if (!data) return null

	return {
		items: JSON.parse(data) as ItemResult[],
		updatedAt: updated ? new Date(updated) : null,
	}
}

export const setCache = async (items: ItemResult[]) => {
	const now = new Date().toISOString()

	await Promise.all([
		redis.set(CACHE_KEY, JSON.stringify(items), 'EX', TTL),
		redis.set(UPDATED_KEY, now, 'EX', TTL),
	])

	return now
}

export { acquireLock, releaseLock }
