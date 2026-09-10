import type { UpgradeItemKey } from './upgrade-prices.const'

export interface UpgradePriceEntry {
	item_id: string
	key: UpgradeItemKey
	min_price: number | null
	count: number
	energy_price: number | null
}

export interface UpgradePricesResponse {
	region: string
	updated_at: string | null
	prices: UpgradePriceEntry[]
}
