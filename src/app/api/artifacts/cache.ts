import { redis } from 'bun'
import type { ArtifactAggregate } from '@/types/artifacts.type'

const TTL = 60 * 60 * 13
const LOCK_TTL = 60 * 10

const cacheKey = (region: string) => `artifacts:prices:${region}`
const lockKey = (region: string) => `artifacts:lock:${region}`

export const acquireLock = async (region: string): Promise<boolean> => {
	return (
		(await redis.set(
			lockKey(region),
			'1',
			'NX',
			'EX',
			LOCK_TTL.toString()
		)) === 'OK'
	)
}

export const releaseLock = async (region: string): Promise<void> => {
	await redis.del(lockKey(region))
}

export const getRegionCache = async (
	region: string
): Promise<ArtifactAggregate | null> => {
	const data = await redis.get(cacheKey(region))
	return data ? (JSON.parse(data) as ArtifactAggregate) : null
}

export const setRegionCache = async (
	region: string,
	value: ArtifactAggregate
): Promise<void> => {
	await redis.set(cacheKey(region), JSON.stringify(value), 'EX', TTL)
}
