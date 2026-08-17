import { redis } from 'bun'
import type { OperationSessionListing } from '@/types/operations.type'

const TTL = 60 * 5

function key(region: string, params: { username?: string; limit?: number; offset?: number }) {
	const username = params.username?.toLowerCase() ?? '*'
	return `player:operations:${region}:${username}:${params.limit ?? 100}:${params.offset ?? 0}`
}

export const getOperations = async (
	region: string,
	params: { username?: string; limit?: number; offset?: number }
): Promise<OperationSessionListing | null> => {
	const data = await redis.get(key(region, params))
	return data ? (JSON.parse(data) as OperationSessionListing) : null
}

export const setOperations = async (
	region: string,
	params: { username?: string; limit?: number; offset?: number },
	value: OperationSessionListing
): Promise<void> => {
	await redis.set(key(region, params), JSON.stringify(value), 'EX', TTL)
}
