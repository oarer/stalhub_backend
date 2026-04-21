import { redis } from 'bun'
import type { BarterCacheData, ListingItem } from '@/types/barter.type'

const BARTER_KEY = 'barter:recipes'
const LISTING_KEY = 'barter:listing'
const LISTING_UPDATED_KEY = 'barter:listing_updated_at'

const BARTER_TTL = 60 * 60 * 24 * 7
const LISTING_TTL = 60 * 60 * 24 * 4
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000

const getJsonCache = async <T>(key: string): Promise<T | null> => {
	const data = await redis.get(key)
	if (!data) return null
	return JSON.parse(data) as T
}

const setJsonCache = async (key: string, value: unknown, ttl: number) => {
	const now = new Date().toISOString()
	await Promise.all([
		redis.set(key, JSON.stringify(value), 'EX', ttl),
		redis.set(`${key}:updated_at`, now, 'EX', ttl),
	])
	return now
}

export const getBarterCache = async (): Promise<BarterCacheData | null> =>
	getJsonCache<BarterCacheData>(BARTER_KEY)

export const setBarterCache = async (data: BarterCacheData) =>
	setJsonCache(BARTER_KEY, data, BARTER_TTL)

export const getListingCache = async (): Promise<Record<
	string,
	ListingItem
> | null> => getJsonCache<Record<string, ListingItem>>(LISTING_KEY)

export const setListingCache = async (data: Record<string, ListingItem>) =>
	setJsonCache(LISTING_KEY, data, LISTING_TTL)

export const shouldRevalidateListing = async (): Promise<boolean> => {
	const updated = await redis.get(LISTING_UPDATED_KEY)
	if (!updated) return true
	return Date.now() - new Date(updated).getTime() > FOUR_DAYS_MS
}