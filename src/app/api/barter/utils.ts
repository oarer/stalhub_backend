import { LOCALE, type Locale } from '@/types/api.type'
import type {
	BarterEntry,
	BarterItemResult,
	BarterOffer,
	BarterRecipe,
	BarterRecipeResult,
	ListingItem,
	UsedInItem,
} from '@/types/barter.type'

const BARTER_URL =
	'https://github.com/EXBO-Studio/stalcraft-database/raw/refs/heads/main/ru/barter_recipes.json'
const LISTING_URL =
	'https://github.com/oarer/sc-db/raw/refs/heads/main/merged/listing.json'

const fetchJson = async <T>(url: string): Promise<T> => {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Failed to fetch ${url}`)
	return res.json()
}

let inMemoryBarter: BarterEntry[] | null = null
let inMemoryListing: Record<string, ListingItem> = {}

export const loadBarter = async () => {
	if (!inMemoryBarter) {
		inMemoryBarter = await fetchJson<BarterEntry[]>(BARTER_URL)
		console.log('[Barter] Loaded', inMemoryBarter.length, 'settlements')
	}
	return inMemoryBarter
}

export const loadListing = async () => {
	if (Object.keys(inMemoryListing).length === 0) {
		const items = await fetchJson<ListingItem[]>(LISTING_URL)
		for (const item of items) {
			const id = item.data.split('/').pop()?.replace('.json', '') ?? ''
			inMemoryListing[id] = item
		}
		console.log(
			'[Barter:Listing] Loaded',
			Object.keys(inMemoryListing).length,
			'items'
		)
	}
	return inMemoryListing
}

export const resetCache = () => {
	inMemoryBarter = null
	inMemoryListing = {}
}

type SettlementTitleResult = Record<Locale, string>

export const normalizeTitles = (
	lines: Record<string, string | undefined>
): SettlementTitleResult =>
	LOCALE.reduce((acc, lang) => {
		acc[lang] = lines[lang] ?? ''
		return acc
	}, {} as SettlementTitleResult)

export const getItemInfo = (
	listing: Record<string, ListingItem>,
	itemId: string
) => listing[itemId]

export const transformOffer = (
	offer: BarterOffer,
	listing: Record<string, ListingItem>
): BarterRecipeResult | null => {
	if (offer.currency !== 'money') return null

	const items = offer.requiredItems
		.map((req) => {
			const info = getItemInfo(listing, req.item)
			if (!info) return null

			return {
				amount: req.amount,
				lines: info.name,
				icon: info.icon,
			}
		})
		.filter((i): i is BarterItemResult => i !== null)

	if (!items.length && offer.cost === 0) return null

	return {
		money: String(offer.cost),
		items,
	}
}

export const transformRecipe = (
	recipe: BarterRecipe,
	listing: Record<string, ListingItem>
): BarterRecipeResult[] =>
	recipe.offers
		.map((offer) => transformOffer(offer, listing))
		.filter((x): x is BarterRecipeResult => x !== null)

export const collectUsedIn = (
	barterData: BarterEntry[],
	itemId: string,
	listing: Record<string, ListingItem>
): UsedInItem[] => {
	const set = new Map<string, UsedInItem>()

	for (const settlement of barterData) {
		for (const recipe of settlement.recipes) {
			const isUsed = recipe.offers.some((o) =>
				o.requiredItems.some((ri) => ri.item === itemId)
			)

			if (!isUsed) continue

			const info = listing[recipe.item]
			if (!info) continue

			set.set(recipe.item, {
				item_id: recipe.item,
				icon: info.icon,
				lines: info.name,
			})
		}
	}

	return [...set.values()]
}

export const pickBestMatch = (
	matched: {
		settlement: BarterEntry
		recipe: BarterRecipe
	}[]
) => {
	return matched.reduce((best, curr) => {
		return curr.recipe.settlementRequiredLevel <
			best.recipe.settlementRequiredLevel
			? curr
			: best
	})
}
