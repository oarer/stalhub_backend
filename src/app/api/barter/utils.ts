import type { BarterEntry, ListingItem } from '@/types/barter.type'

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
