import { auctionService } from '@/app/api/auction/auction.service'
import type { LotsResponse } from '@/types/api.type'
import type { Root } from '@/types/hideout.type'

const HIDEOUT_URL =
	'https://raw.githubusercontent.com/oarer/sc-db/refs/heads/main/merged/hideout_recipes.json'

let inMemoryData: Root | null = null
let loadPromise: Promise<Root> | null = null
let updatePromise: Promise<void> | null = null
const inMemoryPrices: Record<string, number> = {}

const fetchJson = async <T>(url: string): Promise<T> => {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Failed to fetch ${url}`)
	return res.json()
}

const getMinBuyoutPrice = (data: LotsResponse): number | null => {
	if (!data.lots?.length) return null
	return Math.min(...data.lots.map((l) => l.buyoutPrice))
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

export const updatePrices = async () => {
	if (updatePromise) return updatePromise

	const data = inMemoryData ?? (await loadHideoutData())
	const ids = collectItemIds(data)

	updatePromise = (async () => {
		const results = await Promise.allSettled(
			ids.map(async (id) => {
				const lots = await auctionService.lots({
					region: 'RU',
					id,
					limit: '10',
					additional: 'false',
				})
				const price = getMinBuyoutPrice(lots)
				return { id, price }
			})
		)

		for (const result of results) {
			if (result.status === 'fulfilled' && result.value.price !== null) {
				inMemoryPrices[result.value.id] = result.value.price
			}
		}

		console.log(
			'[Hideout] Updated prices for',
			Object.keys(inMemoryPrices).length,
			'items'
		)
	})().finally(() => {
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
