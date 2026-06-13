import { auctionService } from '@/app/api/auction/auction.service'
import type { LotsHistoryResponse } from '@/types/api.type'
import type { Root } from '@/types/hideout.type'

const HIDEOUT_URL =
	'https://raw.githubusercontent.com/oarer/sc-db/refs/heads/main/merged/hideout_recipes.json'

let inMemoryData: Root | null = null
let loadPromise: Promise<Root> | null = null
let updatePromise: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
const inMemoryPrices: Record<string, number> = {}

const fetchJson = async <T>(url: string): Promise<T> => {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Failed to fetch ${url}`)
	return res.json()
}

const getMinBuyoutPrice = (data: LotsHistoryResponse): number | null => {
	if (!data.prices?.length) return null
	return Math.min(...data.prices.map((l) => l.price))
}

const collectItemIds = (data: Root): string[] => {
	const ids = new Set<string>()
	for (const recipe of data.recipes) {
		for (const item of recipe.ingredients) ids.add(item.item)
		for (const item of recipe.result) ids.add(item.item)
	}
	return [...ids]
}

export const loadHideoutData = async () => {
	if (inMemoryData) return inMemoryData
	if (loadPromise) return loadPromise

	loadPromise = fetchJson<Root>(HIDEOUT_URL).then((data) => {
		inMemoryData = data
		loadPromise = null
		console.log('[Hideout] Loaded', data.recipes.length, 'recipes')
		return data
	})

	return loadPromise
}

const fetchPrice = async (
	id: string
): Promise<{ id: string; price: number | null; failed: boolean }> => {
	try {
		const lots = await auctionService.history({
			region: 'RU',
			id,
			limit: '20',
			additional: 'false',
		})
		return { id, price: getMinBuyoutPrice(lots), failed: false }
	} catch {
		return { id, price: null, failed: true }
	}
}

const retryFailedIds = async (ids: string[]) => {
	console.log('[Hideout] Retrying', ids.length, 'failed items...')

	const results = await Promise.all(ids.map(fetchPrice))

	const failedIds: string[] = []
	let successCount = 0

	for (const { id, price, failed } of results) {
		if (price !== null) {
			inMemoryPrices[id] = price
			successCount++
		} else if (failed) {
			failedIds.push(id)
		}
	}

	console.log(
		'[Hideout] Retry done:',
		successCount,
		'succeeded,',
		failedIds.length,
		'still failed'
	)

	if (failedIds.length > 0) {
		console.log(
			'[Hideout] Next retry for',
			failedIds.length,
			'items in 1 minute'
		)
		retryTimer = setTimeout(() => retryFailedIds(failedIds), 60000)
	}
}

export const updatePrices = async () => {
	if (updatePromise) return updatePromise

	if (retryTimer) {
		clearTimeout(retryTimer)
		retryTimer = null
	}

	const data = inMemoryData ?? (await loadHideoutData())
	const ids = collectItemIds(data)

	updatePromise = (async () => {
		const results = await Promise.all(ids.map(fetchPrice))

		const failedIds: string[] = []

		for (const { id, price, failed } of results) {
			if (price !== null) {
				inMemoryPrices[id] = price
			} else if (failed) {
				failedIds.push(id)
			}
		}

		console.log(
			'[Hideout] Updated prices for',
			Object.keys(inMemoryPrices).length,
			'items'
		)

		if (failedIds.length > 0) {
			console.log(
				'[Hideout] Retrying',
				failedIds.length,
				'failed items in 1 minute'
			)

			retryTimer = setTimeout(() => retryFailedIds(failedIds), 60000)
		}
	})()

	updatePromise = updatePromise.finally(() => {
		updatePromise = null
	})

	return updatePromise
}

export const attachPrices = (data: Root): Root => {
	return {
		...data,
		recipes: data.recipes.map((recipe) => ({
			...recipe,
			ingredients: recipe.ingredients.map((item) => {
				const rawPrice = inMemoryPrices[item.item]
				return {
					...item,
					price:
						rawPrice != null
							? item.amount > 1
								? Math.round(rawPrice / item.amount)
								: rawPrice
							: null,
				}
			}),
			result: recipe.result.map((item) => {
				const rawPrice = inMemoryPrices[item.item]
				return {
					...item,
					price:
						rawPrice != null
							? item.amount > 1
								? Math.round(rawPrice / item.amount)
								: rawPrice
							: null,
				}
			}),
		})),
	}
}
