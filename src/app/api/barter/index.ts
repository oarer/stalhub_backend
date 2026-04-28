import { cron } from '@elysiajs/cron'
import type { BarterEntry, BarterRecipe } from '@/types/barter.type'
import { createElysia } from '@/utils/elysia'
import {
	collectUsedIn,
	loadBarter,
	loadListing,
	normalizeTitles,
	pickBestMatch,
	resetCache,
	transformRecipe,
} from './utils'

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
	.get('/barter/:itemId', async ({ params, status }) => {
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
			return status(404, {
				message: 'Item not found',
			})
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
