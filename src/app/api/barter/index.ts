import { cron } from '@elysiajs/cron'
import { LOCALE, type Locale } from '@/types/api.type'
import type {
	BarterEntry,
	BarterItemResult,
	BarterOffer,
	BarterRecipe,
	BarterRecipeResult,
	ListingItem,
} from '@/types/barter.type'
import { createElysia } from '@/utils/elysia'
import { loadBarter, loadListing, resetCache } from './utils'

type SettlementTitleResult = Record<Locale, string>

const normalizeTitles = (
	lines: Record<string, string | undefined>
): SettlementTitleResult =>
	LOCALE.reduce((acc, lang) => {
		acc[lang] = lines[lang] ?? ''
		return acc
	}, {} as SettlementTitleResult)

const getItemInfo = (listing: Record<string, ListingItem>, itemId: string) =>
	listing[itemId]

const transformOffer = (
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

const transformRecipe = (
	recipe: BarterRecipe,
	listing: Record<string, ListingItem>
): BarterRecipeResult[] =>
	recipe.offers
		.map((offer) => transformOffer(offer, listing))
		.filter((x): x is BarterRecipeResult => x !== null)

type UsedInItem = { item_id: string; icon: string }

const collectUsedIn = (
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
			})
		}
	}

	return [...set.values()]
}

const pickBestMatch = (
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

export const routeBarter = createElysia()
	.use(
		cron({
			name: 'barter-update',
			pattern: '0 0 * * WED',
			timezone: 'Europe/Moscow',
			run: resetCache,
		})
	)
	.onStart(async () => {
		await loadListing()
		await loadBarter()
	})
	.get('/barter/:itemId', async ({ params }) => {
		const { itemId } = params

		const [barterData, listing] = await Promise.all([
			loadBarter(),
			loadListing(),
		])

		const matched = barterData
			.map((settlement) => ({
				settlement,
				recipe: settlement.recipes.find((r) => r.item === itemId),
			}))
			.filter(
				(x): x is { settlement: BarterEntry; recipe: BarterRecipe } =>
					x.recipe !== undefined
			)

		const usedIn = collectUsedIn(barterData, itemId, listing)

		if (!matched.length) {
			return {
				settlement_required_level: '1',
				settlement_titles: [],
				used_in: usedIn,
				recipes: [],
			}
		}

		const best = pickBestMatch(matched)

		return {
			settlement_required_level: String(
				best.recipe.settlementRequiredLevel
			),
			settlement_titles: matched.map(({ settlement }) =>
				normalizeTitles(settlement.settlementTitle.lines)
			),
			used_in: usedIn,
			recipes: transformRecipe(best.recipe, listing),
		}
	})