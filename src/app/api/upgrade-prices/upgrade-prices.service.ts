import { LotsPuller } from '@/app/api/auction/lots-puller'
import type { Lot } from '@/types/api.type'
import {
	getUpgradePricesCache,
	setUpgradePricesCache,
} from './upgrade-prices.cache'
import { UPGRADE_ITEMS, type UpgradeItemMeta } from './upgrade-prices.const'
import type {
	UpgradePriceEntry,
	UpgradePricesResponse,
} from './upgrade-prices.type'

export const SUPPORTED_REGIONS = ['RU'] as const

const lotsPuller = new LotsPuller({
	label: 'UpgradePrices',
	batchRetryAttempts: 1,
	batchRetryDelayMs: 15000,
})

const allBuyoutPrices = (lots: Lot[]): number[] =>
	lots.filter((lot) => lot.buyoutPrice > 0).map((lot) => lot.buyoutPrice)

const buildEntry = (meta: UpgradeItemMeta, lots: Lot[]): UpgradePriceEntry => {
	const prices = allBuyoutPrices(lots)
	const minPrice = prices.length > 0 ? Math.min(...prices) : null

	return {
		item_id: meta.itemId,
		key: meta.key,
		min_price: minPrice,
		count: prices.length,
		energy_price:
			meta.energy != null && minPrice != null
				? minPrice / meta.energy
				: null,
	}
}

export const updateRegion = async (region: string): Promise<void> => {
	const itemIds = UPGRADE_ITEMS.map((meta) => meta.itemId)

	const { groups, failedIds } = await lotsPuller.fetchWithBatchRetry(
		region,
		itemIds
	)

	const prices = UPGRADE_ITEMS.map((meta) =>
		buildEntry(meta, groups[meta.itemId])
	)

	setUpgradePricesCache(region, {
		region,
		updated_at: new Date().toISOString(),
		prices,
	})

	console.log(
		`[UpgradePrices] ${region} updated: ${prices.length} items, ${failedIds.length > 0 ? `${failedIds.length} failed` : 'all ok'}`
	)
}

let updatePromise: Promise<void> | null = null

export const updateAllRegions = async (): Promise<void> => {
	if (updatePromise) return updatePromise

	updatePromise = (async () => {
		try {
			await Promise.all(SUPPORTED_REGIONS.map((r) => updateRegion(r)))
		} catch (err) {
			console.error('Failed to update upgrade prices:', err)
		}
	})().finally(() => {
		updatePromise = null
	})

	return updatePromise
}

export const getUpgradePrices = (
	region: string
): UpgradePricesResponse | null => getUpgradePricesCache(region)
