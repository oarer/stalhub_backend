import { apiClient } from '@/app/interceptors/sc.interceptor'
import items from '@/data/arsenal.json'
import type { LotsHistoryResponse } from '@/types/api.type'
import type { ItemInput, ItemResult } from '@/types/arsenal.type'
import { acquireLock, releaseLock, setCache } from './cache'

const getAveragePrice = (prices: { price: number }[]) => {
    if (!prices.length) return null
    return Math.round(
        prices.reduce((acc, p) => acc + p.price, 0) / prices.length
    )
}

export const fetchItemPrice = async (itemId: string, region = 'eu') => {
    try {
        const { data } = await apiClient.get<LotsHistoryResponse>(
            `/${region}/auction/${itemId}/history`,
            { params: { limit: 20 } }
        )

        return getAveragePrice(data.prices ?? [])
    } catch {
        return null
    }
}

export const updatePrices = async () => {
    const gotLock = await acquireLock()
    if (!gotLock) return

    try {
        const result = await Promise.all(
            items.map(async (item: ItemInput) => {
                const fetched = item.id ? await fetchItemPrice(item.id) : null
                return {
                    ...item,
                    currentPrice: (fetched ?? item.currentPrice) || 0,
                } satisfies ItemResult
            })
        )

        const now = await setCache(result)
        console.log('[Arsenal] Updated:', now)
    } finally {
        await releaseLock()
    }
}
