import { redis } from 'bun'
import type { LotsHistoryResponse, LotsResponse } from '@/types/api.type'

const TTL = 60 * 5

const key = (
	type: string,
	region: string,
	id: string,
	limit: string,
	additional: string
) => `auction:${type}:${region}:${id}:${limit}:${additional}`

export const getLots = async (
	region: string,
	id: string,
	limit: string,
	additional: string
): Promise<LotsResponse | null> => {
	const data = await redis.get(key('lots', region, id, limit, additional))
	return data ? (JSON.parse(data) as LotsResponse) : null
}

export const setLots = async (
	region: string,
	id: string,
	limit: string,
	additional: string,
	value: LotsResponse
): Promise<void> => {
	await redis.set(
		key('lots', region, id, limit, additional),
		JSON.stringify(value),
		'EX',
		TTL
	)
}

export const getHistory = async (
	region: string,
	id: string,
	limit: string,
	additional: string
): Promise<LotsHistoryResponse | null> => {
	const data = await redis.get(key('history', region, id, limit, additional))
	return data ? (JSON.parse(data) as LotsHistoryResponse) : null
}

export const setHistory = async (
	region: string,
	id: string,
	limit: string,
	additional: string,
	value: LotsHistoryResponse
): Promise<void> => {
	await redis.set(
		key('history', region, id, limit, additional),
		JSON.stringify(value),
		'EX',
		TTL
	)
}
