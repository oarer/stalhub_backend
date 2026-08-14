import axios from 'axios'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import type { LotsResponse } from '@/types/api.type'
import type {
	ArtifactAggregate,
	ArtifactRow,
	PriceCell,
} from '@/types/artifacts.type'
import { acquireLock, releaseLock, setRegionCache } from './cache'
import { interpolateRatio } from './pricing'

const LISTING_URL =
	'https://raw.githubusercontent.com/oarer/sc-db/refs/heads/main/merged/listing/artefact.json'

export const SUPPORTED_REGIONS = ['RU'] as const

const LOT_LIMIT = 200
const CONCURRENCY = 6

const median = (values: number[]): number | null => {
	if (values.length === 0) return null

	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2
}

const mapLimit = async <T, R>(
	arr: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> => {
	const results: R[] = new Array(arr.length)
	let index = 0

	const worker = async () => {
		while (index < arr.length) {
			const i = index++
			results[i] = await fn(arr[i])
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, arr.length) }, () => worker())
	)

	return results
}

export const fetchListing = async (): Promise<string[]> => {
	const { data } = await axios.get<Record<string, unknown>>(LISTING_URL, {
		timeout: 15_000,
	})
	return Object.keys(data)
}

export const fetchItemLots = async (
	region: string,
	itemId: string
): Promise<LotsResponse['lots']> => {
	const { data } = await apiClient.get<LotsResponse>(
		`/${region}/auction/${itemId}/lots`,
		{
			params: { limit: LOT_LIMIT, additional: true },
		}
	)

	return data.lots ?? []
}

type RawCells = Map<number, number[]>

const buildRow = (cells: RawCells): ArtifactRow | null => {
	const entries = Array.from(cells.entries())
	if (entries.length === 0) return null

	let basePtn = 0
	let baseCount = -1

	for (const [ptn, prices] of entries) {
		if (prices.length > baseCount) {
			basePtn = ptn
			baseCount = prices.length
		}
	}

	const baseMedian = median(cells.get(basePtn) ?? [])

	if (baseMedian == null) return null

	const cellMap: Record<string, PriceCell> = {}
	for (const [ptn, prices] of entries) {
		const med = median(prices)
		if (med == null) continue
		cellMap[String(ptn)] = {
			min: Math.min(...prices),
			median: med,
			count: prices.length,
		}
	}

	return { basePtn, baseMedian, cells: cellMap }
}

export const buildAggregate = (
	lotGroups: Record<string, LotsResponse['lots']>,
	updatedAt: string
): ArtifactAggregate => {
	const rowsByItem: Record<string, (ArtifactRow | null)[] | undefined> = {}

	for (const [itemId, lots] of Object.entries(lotGroups)) {
		const byQlt = new Map<number, RawCells>()

		for (const lot of lots) {
			if (lot.buyoutPrice <= 0) continue

			const additional = lot.additional
			if (!additional) continue

			const qlt = additional.qlt
			if (qlt == null) continue

			const ptn = additional.ptn ?? 0
			const bucket = byQlt.get(qlt) ?? new Map<number, number[]>()
			const prices = bucket.get(ptn) ?? []
			prices.push(lot.buyoutPrice)
			bucket.set(ptn, prices)
			byQlt.set(qlt, bucket)
		}

		if (byQlt.size === 0) continue

		const rows: (ArtifactRow | null)[] = []
		for (let q = 0; q < 7; q++) {
			const bucket = byQlt.get(q)
			rows[q] = bucket ? buildRow(bucket) : null
		}
		rowsByItem[itemId] = rows
	}

	const rowMedian = (itemId: string, qlt: number): number | null => {
		const cell = rowsByItem[itemId]?.[qlt]
		return cell ? cell.baseMedian : null
	}

	const curves: ArtifactAggregate['curves'] = {}
	const ratioSamples = new Map<string, Map<number, number[]>>()

	for (const [itemId, rows] of Object.entries(rowsByItem)) {
		if (!rows) continue
		for (let q = 0; q < 7; q++) {
			const row = rows[q]
			if (!row) continue

			const ptn0Median = rowMedian(itemId, q)
			if (ptn0Median == null || ptn0Median <= 0) continue

			for (const [ptn, cell] of Object.entries(row.cells)) {
				const p = Number(ptn)
				if (p === 0 || !cell.median) continue

				const samples = ratioSamples.get(String(q)) ?? new Map()
				const bucket = samples.get(p) ?? []
				bucket.push(cell.median / ptn0Median)
				samples.set(p, bucket)
				ratioSamples.set(String(q), samples)
			}
		}
	}

	for (const [q, samples] of ratioSamples) {
		const ratios: Record<string, number> = {}
		for (const [ptn, values] of samples) {
			const med = median(values)
			if (med != null) ratios[String(ptn)] = med
		}
		if (Object.keys(ratios).length > 0) curves[q] = ratios
	}

	const base0: Record<string, number[]> = {}

	for (const itemId of Object.keys(rowsByItem)) {
		for (let q = 0; q < 7; q++) {
			const row = rowsByItem[itemId]?.[q]
			if (!row) continue

			const factor = interpolateRatio(curves[String(q)], row.basePtn)
			const normalized =
				factor > 0 ? row.baseMedian / factor : row.baseMedian
			const bucket = base0[String(q)] ?? []
			bucket.push(normalized)
			base0[String(q)] = bucket
		}
	}

	const qualityRatios: ArtifactAggregate['qualityRatios'] = {}
	const zero = base0['0']
	if (zero && zero.length > 0) {
		for (let q = 1; q < 7; q++) {
			const values = base0[String(q)]
			if (!values || values.length === 0) continue

			const ratios = zero
				.map((z, i) =>
					values[i] != null && z > 0 ? values[i] / z : null
				)
				.filter((v): v is number => v != null)

			if (ratios.length > 0)
				qualityRatios[String(q)] = median(ratios) ?? 1
		}
	}

	const tiers: ArtifactAggregate['tiers'] = {}
	for (let q = 0; q < 7; q++) {
		const values = base0[String(q)]
		const med = median(values ?? [])
		if (med != null) tiers[String(q)] = med
	}

	return {
		updatedAt,
		items: rowsByItem,
		curves,
		qualityRatios,
		tiers,
	}
}

export const updateRegion = async (region: string): Promise<void> => {
	const gotLock = await acquireLock(region)
	if (!gotLock) return

	try {
		const itemIds = await fetchListing()

		const lotGroups: Record<string, LotsResponse['lots']> = {}

		await mapLimit(itemIds, CONCURRENCY, async (itemId) => {
			try {
				lotGroups[itemId] = await fetchItemLots(region, itemId)
			} catch {
				lotGroups[itemId] = []
			}
		})

		const aggregate = buildAggregate(lotGroups, new Date().toISOString())
		const traded = Object.keys(aggregate.items).length

		if (traded > 0) {
			await setRegionCache(region, aggregate)
		}

		console.log(
			`[Artifacts] ${region} updated: ${traded}/${itemIds.length} traded items`
		)
	} finally {
		await releaseLock(region)
	}
}

export const updateAllRegions = async (): Promise<void> => {
	await Promise.all(SUPPORTED_REGIONS.map((region) => updateRegion(region)))
}
