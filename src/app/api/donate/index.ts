import raw from '@/data/donate-calculator.json'
import { createElysia } from '@/utils/elysia'

type DonateItem = {
	key: string
	id: string
	amount: number
	stalcoins: number
	name: Record<string, string>
	icon: string | null
	market: {
		has_market?: boolean
		price?: number | null
		median?: number | null
		cheapest_lot?: number | null
		[key: string]: unknown
	}
}

type ListingEntry = {
	data: string
	icon: string
	name: Record<string, string>
}

let listingMap: Map<string, ListingEntry> | null = null

async function loadListing(): Promise<Map<string, ListingEntry>> {
	if (listingMap) return listingMap
	const res = await fetch('https://cdn.stalhub.dev/db/listing.json')
	const arr = (await res.json()) as ListingEntry[]
	const map = new Map<string, ListingEntry>()
	for (const e of arr) {
		const id = e.data?.split('/').pop()?.replace('.json', '')
		if (id) map.set(id, e)
	}
	listingMap = map
	return map
}

export const routeDonate = createElysia().get(
	'/donate-calculator',
	async () => {
		const data = raw as unknown as { computed_at: string; items: DonateItem[] }
		const listing = await loadListing().catch(() => new Map())

		const missing: string[] = []
		const items = data.items.map((it) => {
			const entry = listing.get(it.id)
			if (!entry) missing.push(it.id)
			const price = it.market?.has_market ? Number(it.market.price ?? 0) : 0
			const perCoin = it.stalcoins > 0 && price > 0 ? price / it.stalcoins : 0
			return {
				key: it.key,
				id: it.id,
				amount: it.amount,
				stalcoins: it.stalcoins,
				name: entry?.name ?? it.name,
				icon: entry?.icon ?? null,
				has_market: !!it.market?.has_market && price > 0,
				price,
				price_per_coin: Math.round(perCoin * 100) / 100,
			}
		})

		items.sort((a, b) => b.price_per_coin - a.price_per_coin)

		return {
			computed_at: data.computed_at,
			total: items.length,
			items,
			missing,
		}
	}
)
