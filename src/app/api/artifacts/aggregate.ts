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
	'https://cdn.stalhub.dev/db/listing/artefact.json'

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

const withRetry = async <T>(
	fn: () => Promise<T>,
	attempts = 3,
	delayMs = 1000
): Promise<T> => {
	let lastErr: unknown
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn()
		} catch (err) {
			lastErr = err
			if (attempt === attempts) break
			await new Promise((r) => setTimeout(r, delayMs * attempt))
		}
	}
	throw lastErr
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
	const { data } = await withRetry(() =>
		axios.get<Record<string, unknown>>(LISTING_URL, {
			timeout: 15_000,
		})
	)
	return Object.keys(data)
}

export const fetchItemLots = async (
	region: string,
	item_id: string
): Promise<LotsResponse['lots']> => {
	const { data } = await apiClient.get<LotsResponse>(
		`/${region}/auction/${item_id}/lots`,
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
	totalCount: number,
	attempt = 1,
	maxAttempts = 3
) => {
	if (attempt > maxAttempts || failedIds.length === 0) return

	console.log(
		`[Artifacts] ${region} retrying ${failedIds.length} failed items (attempt ${attempt}/${maxAttempts})...`
	)

	await new Promise((r) => setTimeout(r, 60_000))

	const stillFailed: string[] = []

	await mapLimit(failedIds, CONCURRENCY, async (item_id) => {
		try {
			lotGroups[item_id] = await withRetry(
				() => fetchItemLots(region, item_id),
				2
			)
		} catch {
			stillFailed.push(item_id)
		}
	})

	const aggregate = buildAggregate(lotGroups, new Date().toISOString())
	const traded = Object.keys(aggregate.items).length

	if (traded > 0) {
		setRegionCache(region, aggregate)
	}

	console.log(
		`[Artifacts] ${region} retry ${attempt} done: ${traded}/${totalCount} traded items, ${stillFailed.length} still failed`
	)

	if (stillFailed.length > 0) {
		await retryFailedItems(
			region,
			stillFailed,
			lotGroups,
			totalCount,
			attempt + 1,
			maxAttempts
		)
	}
}

export const updateRegion = async (region: string): Promise<number> => {
	const gotLock = await acquireLock(region)
	if (!gotLock) return 0

	try {
		const itemIds = await fetchListing()

		const lotGroups: Record<string, LotsResponse['lots']> = {}
		const failedIds: string[] = []

		await mapLimit(itemIds, CONCURRENCY, async (item_id) => {
			try {
				lotGroups[item_id] = await withRetry(
					() => fetchItemLots(region, item_id),
					2
				)
			} catch {
				lotGroups[item_id] = []
				failedIds.push(item_id)
			}
		})

		const aggregate = buildAggregate(lotGroups, new Date().toISOString())
		const traded = Object.keys(aggregate.items).length

		if (traded > 0) {
			setRegionCache(region, aggregate)
		}

		console.log(
			`[Artifacts] ${region} updated: ${traded}/${itemIds.length} traded items${failedIds.length > 0 ? `, ${failedIds.length} failed` : ''}`
		)

		if (failedIds.length > 0) {
			retryFailedItems(region, failedIds, lotGroups, itemIds.length).catch(
				(err) => console.error(`[Artifacts] ${region} retry error:`, err)
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
