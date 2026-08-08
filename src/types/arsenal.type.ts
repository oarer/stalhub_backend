export type ItemInput = {
	name: Record<string, string>
	currentPrice?: number
	id?: string
	limit?: number
}

export type ItemResult = ItemInput & {
	currentPrice: number | null
}

export type CacheData = {
	items: ItemResult[]
	updatedAt: Date | null
}
