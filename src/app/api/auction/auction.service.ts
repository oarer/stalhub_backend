import { auctionRequestsTotal } from '@/app/api/metrics'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import type { LotsHistoryResponse, LotsResponse } from '@/types/api.type'
import * as cache from './cache'

export class AuctionService {
	async lots({
		region,
		id,
		limit = '10',
		additional = 'true',
	}: {
		region: string
		id: string
		limit?: string
		additional?: string
	}): Promise<LotsResponse> {
		const cached = await cache.getLots(region, id, limit, additional)
		if (cached) return cached

		const { data } = await apiClient.get<LotsResponse>(
			`/${region}/auction/${id}/lots`,
			{ params: { limit, additional } }
		)
		auctionRequestsTotal.inc({ region, type: 'lots' })
		await cache.setLots(region, id, limit, additional, data)
		return data
	}

	async history({
		region,
		id,
		limit = '10',
		additional = 'true',
	}: {
		region: string
		id: string
		limit?: string
		additional?: string
	}): Promise<LotsHistoryResponse> {
		const cached = await cache.getHistory(region, id, limit, additional)
		if (cached) return cached

		const { data } = await apiClient.get<LotsHistoryResponse>(
			`/${region}/auction/${id}/history`,
			{ params: { limit, additional } }
		)
		auctionRequestsTotal.inc({ region, type: 'history' })
		await cache.setHistory(region, id, limit, additional, data)
		return data
	}
}

export const auctionService = new AuctionService()
