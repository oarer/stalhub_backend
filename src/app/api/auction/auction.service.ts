import { auctionRequestsTotal } from '@/app/api/metrics'
import { scGateway } from '@/app/api/sc-gateway/gateway'
import type { LotsHistoryResponse, LotsResponse } from '@/types/api.type'
import * as cache from './cache'

export class AuctionService {
	async lots({
		region,
		id,
		limit = '10',
		additional = 'true',
		offset = '0',
	}: {
		region: string
		id: string
		limit?: string
		additional?: string
		offset?: string
	}): Promise<LotsResponse> {
		const cached = await cache.getLots(
			region,
			id,
			limit,
			additional,
			offset
		)
		if (cached) return cached

		const data = await scGateway.get<LotsResponse>(
			`/${region}/auction/${id}/lots`,
			{ limit, additional, offset }
		)
		auctionRequestsTotal.inc({ region, type: 'lots' })
		await cache.setLots(region, id, limit, additional, offset, data)
		return data
	}

	async history({
		region,
		id,
		limit = '10',
		additional = 'true',
		offset = '0',
	}: {
		region: string
		id: string
		limit?: string
		additional?: string
		offset?: string
	}): Promise<LotsHistoryResponse> {
		const cached = await cache.getHistory(
			region,
			id,
			limit,
			additional,
			offset
		)
		if (cached) return cached

		const data = await scGateway.get<LotsHistoryResponse>(
			`/${region}/auction/${id}/history`,
			{ limit, additional, offset }
		)
		auctionRequestsTotal.inc({ region, type: 'history' })
		await cache.setHistory(region, id, limit, additional, offset, data)
		return data
	}
}

export const auctionService = new AuctionService()
