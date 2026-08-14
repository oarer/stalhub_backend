import { redis } from 'bun'

const TTL = 60 * 60 * 6

const k = (r: string, c: string) => `grenades:${r}:${c.toLowerCase()}`

export interface GrenadeStats {
	character: string
	region: string
	total: number
	stat_id: string
	fetched_at: string
}

export async function getGrenades(region: string, character: string) {
	const v = await redis.get(k(region, character))
	return v ? (JSON.parse(v) as GrenadeStats) : null
}

export async function setGrenades(
	region: string,
	character: string,
	val: unknown
) {
	await redis.set(k(region, character), JSON.stringify(val), 'EX', TTL)
}
