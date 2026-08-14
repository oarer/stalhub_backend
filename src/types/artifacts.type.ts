export type PriceCell = {
	min: number
	median: number
	count: number
}

export type ArtifactRow = {
	basePtn: number
	baseMedian: number
	cells: Record<string, PriceCell>
}

export type ArtifactAggregate = {
	updatedAt: string
	items: Record<string, (ArtifactRow | null)[] | undefined>
	curves: Record<string, Record<string, number> | undefined>
	qualityRatios: Record<string, number | undefined>
	tiers: Record<string, number | undefined>
}

export type ArtifactPriceQuery = {
	itemId: string
	qlt: number
	ptn: number
}

export type ArtifactPriceResult = ArtifactPriceQuery & {
	price: number | null
	source: 'market' | 'estimate' | null
	count: number
}

export type ArtifactPricesResponse = {
	updatedAt: string | null
	region: string
	prices: ArtifactPriceResult[]
}
