import { scGateway } from '@/app/api/sc-gateway/gateway'
import items from '@/data/arsenal.json'
import type { LotsHistoryResponse } from '@/types/api.type'
import type { ItemInput, ItemResult } from '@/types/arsenal.type'
import { acquireLock, releaseLock, setCache } from './cache'

type ListingEntry = { data: string; icon?: string }

let listingIconMap: Map<string, string> | null = null

const loadListingIcons = async (): Promise<Map<string, string>> => {
	if (listingIconMap) return listingIconMap
	try {
		const res = await fetch('https://cdn.stalhub.dev/db/listing.json')
		const arr = (await res.json()) as ListingEntry[]
		const map = new Map<string, string>()
		for (const e of arr) {
			const id = e.data?.split('/').pop()?.replace('.json', '')
			if (id && e.icon) map.set(id, e.icon)
		}
		listingIconMap = map
		return map
	} catch {
		return new Map()
	}
}

const getAveragePrice = (prices: { price: number }[]) => {
	if (!prices.length) return null
	return Math.round(
		prices.reduce((acc, p) => acc + p.price, 0) / prices.length
	)
}

export const fetchItemPrice = async (item_id: string, region = 'eu') => {
	try {
		const data = await scGateway.get<LotsHistoryResponse>(
			`/${region}/auction/${item_id}/history`,
			{ limit: 20 }
		)

		return getAveragePrice(data.prices ?? [])
	} catch {
		return null
	}
}

export const updatePrices = async () => {
	const gotLock = await acquireLock()
	if (!gotLock) return

	try {
		const icons = await loadListingIcons()
		const result = await Promise.all(
			items.map(async (item: ItemInput) => {
				const fetched = item.id ? await fetchItemPrice(item.id) : null
				return {
					...item,
					icon: item.id ? (icons.get(item.id) ?? item.icon) : item.icon,
					currentPrice: (fetched ?? item.currentPrice) || 0,
				} satisfies ItemResult
			})
		)

		const now = await setCache(result)
		console.log('[Arsenal] Updated:', now)
	} finally {
		await releaseLock()
	}
}
