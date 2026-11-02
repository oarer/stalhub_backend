import { Elysia } from 'elysia'
import {
	getUpgradePrices,
	SUPPORTED_REGIONS,
	updateAllRegions,
} from './upgrade-prices.service'
import type { UpgradePricesResponse } from './upgrade-prices.type'

export const upgradePricesRoutes = new Elysia()
	.onStart(async () => {
		try {
			await updateAllRegions()
		} catch (err) {
			console.error('[UpgradePrices] Failed to parse on start:', err)
		}
	})
	.get(
		'/upgrade-prices/:region',
		({ params, set }): UpgradePricesResponse => {
			const { region } = params

			if (
				!SUPPORTED_REGIONS.includes(
					region as (typeof SUPPORTED_REGIONS)[number]
				)
			) {
				set.status = 400
				return { region, updated_at: null, prices: [] }
			}

			const data = getUpgradePrices(region)

			if (!data) {
				set.status = 503
				return { region, updated_at: null, prices: [] }
			}

			return data
		}
	)
