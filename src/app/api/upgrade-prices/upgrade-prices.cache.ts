import type { UpgradePricesResponse } from './upgrade-prices.type'

const inMemoryCache: Record<string, UpgradePricesResponse | null> = {}

export const getUpgradePricesCache = (
	region: string
): UpgradePricesResponse | null => inMemoryCache[region] ?? null

export const setUpgradePricesCache = (
	region: string,
	value: UpgradePricesResponse
): void => {
	inMemoryCache[region] = value
}
