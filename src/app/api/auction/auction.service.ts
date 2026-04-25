import { apiClient } from '@/app/interceptors/sc.interceptor'
import type { LotsHistoryResponse, LotsResponse } from '@/types/api.type'

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
		const { data } = await apiClient.get<LotsResponse>(
			`/${region}/auction/${id}/lots`,
			{
				params: { limit, additional },
			}
		)

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
		const { data } = await apiClient.get<LotsHistoryResponse>(
			`/${region}/auction/${id}/history`,
			{
				params: { limit, additional },
			}
		)

		return data
	}
}

export const auctionService = new AuctionService()
