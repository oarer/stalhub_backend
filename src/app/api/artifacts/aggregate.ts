import axios from 'axios'
import { LotsPuller, withRetry } from '@/app/api/auction/lots-puller'
import type { LotsResponse } from '@/types/api.type'
import type {
	ArtifactAggregate,
	ArtifactRow,
	PriceCell,
} from '@/types/artifacts.type'
import { acquireLock, releaseLock, setRegionCache } from './cache'
import { interpolateRatio } from './pricing'

const LISTING_URL = 'https://cdn.stalhub.dev/db/listing/artefact.json'

export const SUPPORTED_REGIONS = ['RU'] as const

const lotsPuller = new LotsPuller({
	label: 'Artifacts',
	attemptsPerItem: 2,
})

const median = (values: number[]): number | null => {
	if (values.length === 0) return null

	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2
}

export const fetchListing = async (): Promise<string[]> => {
	const { data } = await withRetry(() =>
		axios.get<Record<string, unknown>>(LISTING_URL, {
			timeout: 15_000,
		})
	)
	return Object.keys(data)
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
	updated_at: string
): ArtifactAggregate => {
	const rowsByItem: Record<string, (ArtifactRow | null)[] | undefined> = {}

	for (const [item_id, lots] of Object.entries(lotGroups)) {
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
		rowsByItem[item_id] = rows
	}

	const rowMedian = (item_id: string, qlt: number): number | null => {
		const cell = rowsByItem[item_id]?.[qlt]
		return cell ? cell.baseMedian : null
	}

	const curves: ArtifactAggregate['curves'] = {}
	const ratioSamples = new Map<string, Map<number, number[]>>()

	for (const [item_id, rows] of Object.entries(rowsByItem)) {
		if (!rows) continue
		for (let q = 0; q < 7; q++) {
			const row = rows[q]
			if (!row) continue

			const ptn0Median = rowMedian(item_id, q)
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

	for (const item_id of Object.keys(rowsByItem)) {
		for (let q = 0; q < 7; q++) {
			const row = rowsByItem[item_id]?.[q]
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
		updated_at,
		items: rowsByItem,
		curves,
		qualityRatios,
		tiers,
	}
}

const retryFailedItems = async (
	region: string,
	failedIds: string[],
	lotGroups: Record<string, LotsResponse['lots']>,
	totalCount: number
) => {
	await lotsPuller.drainFailed(
		region,
		failedIds,
		(extraGroups, stillFailed) => {
			Object.assign(lotGroups, extraGroups)

			const aggregate = buildAggregate(
				lotGroups,
				new Date().toISOString()
			)
			const traded = Object.keys(aggregate.items).length

			if (traded > 0) {
				setRegionCache(region, aggregate)
			}

			console.log(
				`[Artifacts] ${region} retry done: ${traded}/${totalCount} traded items, ${stillFailed.length} still failed`
			)
		}
	)
}

export const updateRegion = async (region: string): Promise<number> => {
	const gotLock = await acquireLock(region)
	if (!gotLock) return 0

	try {
		const itemIds = await fetchListing()

		const lotGroups: Record<string, LotsResponse['lots']> = {}
		const { groups, failedIds } = await lotsPuller.fetchMany(
			region,
			itemIds
		)
		Object.assign(lotGroups, groups)

		const aggregate = buildAggregate(lotGroups, new Date().toISOString())
		const traded = Object.keys(aggregate.items).length

		if (traded > 0) {
			setRegionCache(region, aggregate)
		}

		console.log(
			`[Artifacts] ${region} updated: ${traded}/${itemIds.length} traded items${failedIds.length > 0 ? `, ${failedIds.length} failed` : ''}`
		)

		if (failedIds.length > 0) {
			retryFailedItems(
				region,
				failedIds,
				lotGroups,
				itemIds.length
			).catch((err) =>
				console.error(`[Artifacts] ${region} retry error:`, err)
			)
		}

		return traded
	} finally {
		await releaseLock(region)
	}
}

const MAX_RETRIES = 5
const RETRY_DELAY_MS = 60_000

let updatePromise: Promise<number> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null

const scheduleRetry = (attempt: number) => {
	if (retryTimer) {
		clearTimeout(retryTimer)
		retryTimer = null
	}

	if (attempt >= MAX_RETRIES) return

	console.warn(
		`[Artifacts] Update failed, retrying in ${
			RETRY_DELAY_MS / 1000
		}s (${attempt + 1}/${MAX_RETRIES})`
	)

	retryTimer = setTimeout(() => {
		retryTimer = null
		updateAllRegions(attempt + 1)
	}, RETRY_DELAY_MS)
}

export const updateAllRegions = async (attempt = 0): Promise<number> => {
	if (updatePromise) return updatePromise

	updatePromise = (async () => {
		try {
			const results = await Promise.all(
				SUPPORTED_REGIONS.map((region) => updateRegion(region))
			)
			const traded = results.reduce((total, value) => total + value, 0)

			if (traded === 0) scheduleRetry(attempt)

			return traded
		} catch (err) {
			console.error('Failed to update artifacts prices:', err)
			scheduleRetry(attempt)
			return 0
		}
	})().finally(() => {
		updatePromise = null
	})

	return updatePromise
}
