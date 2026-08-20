interface TranslatedName {
	type: string
	key: string
	lines: Record<string, string>
}

interface ListingItem {
	id: string
	category: string
	name: TranslatedName
}

type GrenadeBoxMap = Record<string, ListingItem>
type ConsumableItem = ListingItem

const GRENADES_BOX_URL =
	'https://cdn.stalhub.dev/db/listing/grenadesBox.json'
const CONSUMABLES_URL =
	'https://cdn.stalhub.dev/db/listing/consumables.json'

const CACHE_TTL = 60 * 60 * 1000 // 1 hour

let grenadesBoxCache: { data: GrenadeBoxMap; ts: number } | null = null
let consumablesCache: { data: ConsumableItem[]; ts: number } | null = null

export class ListingService {
	private async fetchJson<T>(url: string): Promise<T> {
		const res = await fetch(url)
		if (!res.ok) throw new Error(`Failed to fetch ${url}`)
		return res.json() as Promise<T>
	}

	async getGrenadeBoxes() {
		if (
			grenadesBoxCache &&
			Date.now() - grenadesBoxCache.ts < CACHE_TTL
		) {
			return grenadesBoxCache.data
		}
		const data = await this.fetchJson<GrenadeBoxMap>(GRENADES_BOX_URL)
		grenadesBoxCache = { data, ts: Date.now() }
		return data
	}

	async getConsumables() {
		if (
			consumablesCache &&
			Date.now() - consumablesCache.ts < CACHE_TTL
		) {
			return consumablesCache.data
		}
		const data = await this.fetchJson<ConsumableItem[]>(CONSUMABLES_URL)
		consumablesCache = { data, ts: Date.now() }
		return data
	}

	extractName(item: ListingItem, locale = 'ru'): string {
		return item.name.lines[locale] ?? item.name.key
	}
}

export const listingService = new ListingService()
