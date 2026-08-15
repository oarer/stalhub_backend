import { redis } from 'bun'
import type { ArtifactAggregate } from '@/types/artifacts.type'

const LOCK_TTL = 60 * 10

const lockKey = (region: string) => `artifacts:lock:${region}`

const inMemoryCache: Record<string, ArtifactAggregate | null> = {}

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

export const getRegionCache = (region: string): ArtifactAggregate | null =>
	inMemoryCache[region] ?? null

export const setRegionCache = (
	region: string,
	value: ArtifactAggregate
): void => {
	inMemoryCache[region] = value
}
