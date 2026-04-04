export type ItemInput = {
	name: Record<string, string>
	price?: number
	id?: string
}

export type ItemResult = ItemInput & {
	currentPrice: number | null
}
//! MOVE TO Api TYPES
export type AuctionHistoryResponse = {
	total: number
	prices: {
		amount: number
		price: number
		time: string
		additional?: Record<string, unknown>
	}[]
}

export type CacheData = {
	items: ItemResult[]
	updatedAt: Date | null
}
