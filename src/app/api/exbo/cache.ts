import { redis } from 'bun'
import type { PlayerResponse } from '@/types/player.type'

const TTL = 60 * 30

const key = (region: string, character: string) =>
	`exbo:profile:${region}:${character.toLowerCase()}`

export const getProfile = async (
	region: string,
	character: string
): Promise<PlayerResponse | null> => {
	const data = await redis.get(key(region, character))
	return data ? (JSON.parse(data) as PlayerResponse) : null
}

export const setProfile = async (
	region: string,
	character: string,
	value: PlayerResponse
): Promise<void> => {
	await redis.set(key(region, character), JSON.stringify(value), 'EX', TTL)
}
