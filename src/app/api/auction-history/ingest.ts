import { loadListing } from '@/app/api/barter/utils'
import {
	type NormalizedGatewayError,
	scGateway,
} from '@/app/api/sc-gateway/gateway'
import { env } from '@/env'
import type { LotHistory } from '@/types/api.type'
import { auctionPool, isAuctionDbEnabled } from './auction-db'
import { auctionHistoryDealsTotal, auctionHistoryRequestsTotal } from './schema'

const REGION = 'RU'
const HISTORY_LIMIT = 200

type DealRow = {
	time: Date
	price: number
	amount: number
	qlt: number
	ptn: number
	additional: string | null
}

const sleep = (ms: number): Promise<void> =>
	new Promise((r) => setTimeout(r, ms))

const isQuotaError = (err: unknown): boolean =>
	typeof err === 'object' &&
	err !== null &&
	'status' in err &&
	(err as NormalizedGatewayError).status === 429

export const toRow = (h: LotHistory): DealRow | null => {
	const time = new Date(h.time)
	if (Number.isNaN(time.getTime())) return null
	const price = Number(h.price)
	if (!Number.isFinite(price)) return null
	const amount = Number.isInteger(h.amount) ? (h.amount as number) : 1
	const add = (h.additional ?? {}) as Record<string, unknown>
	const qlt =
		typeof add.qlt === 'number' && Number.isInteger(add.qlt) ? add.qlt : -1
	const ptn =
		typeof add.ptn === 'number' && Number.isInteger(add.ptn) ? add.ptn : 0
	const raw = JSON.stringify(h.additional ?? {})
	return {
		time,
		price,
		amount,
		qlt,
		ptn,
		additional: raw === '{}' ? null : raw,
	}
}

export const idFromDataPath = (dataPath: string): string => {
	const base = dataPath.split('/').pop() ?? dataPath
	return base.replace(/\.json$/i, '')
}

export const normalizeDataPath = (raw: string): string => {
	let p = raw.trim()
	if (!p.startsWith('/')) p = `/${p}`
	return p
}

const throttledGet = async <T>(
	path: string,
	params: Record<string, unknown>,
	kind: 'sweep' | 'backfill',
	delayMs: number
): Promise<T> => {
	let attempt = 0
	for (;;) {
		try {
			const data = await scGateway.get<T>(path, params)
			auctionHistoryRequestsTotal.inc({ kind })
			if (delayMs > 0) await sleep(delayMs)
			return data
		} catch (err) {
			if (isQuotaError(err) && attempt < 3) {
				attempt++
				console.warn(
					`[AuctionHistory] 429, backoff ${env.AUCTION_QUOTA_BACKOFF_MS}ms (attempt ${attempt})`
				)
				await sleep(env.AUCTION_QUOTA_BACKOFF_MS)
				continue
			}
			throw err
		}
	}
}

const fetchHistoryPage = (
	itemId: string,
	limit: number,
	offset: number,
	kind: 'sweep' | 'backfill',
	delayMs: number
): Promise<{ total: number; prices: LotHistory[] }> =>
	throttledGet(
		`/${REGION}/auction/${itemId}/history`,
		{ limit, offset, additional: true },
		kind,
		delayMs
	)

export type IngestStats = {
	items: number
	pages: number
	rows: number
	inserted: number
	failed: number
	startedAt: number
	finishedAt: number
}

const emptyStats = (): IngestStats => ({
	items: 0,
	pages: 0,
	rows: 0,
	inserted: 0,
	failed: 0,
	startedAt: Date.now(),
	finishedAt: 0,
})

let lastSweep: IngestStats | null = null
let lastBackfill: IngestStats | null = null
let running = false

export const ingestStatus = (): {
	enabled: boolean
	running: boolean
	lastSweep: IngestStats | null
	lastBackfill: IngestStats | null
} => ({ enabled: isAuctionDbEnabled(), running, lastSweep, lastBackfill })

const upsertRows = async (
	itemDbId: number,
	rows: DealRow[]
): Promise<number> => {
	const pool = auctionPool()
	if (!pool || rows.length === 0) return 0
	// чанки hypertable создаются сам TimescaleDB, руками ничего не пилим
	const values: string[] = []
	const params: unknown[] = []
	rows.forEach((r, i) => {
		const o = i * 7
		values.push(
			`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`
		)
		params.push(
			itemDbId,
			r.time.toISOString(),
			r.price,
			r.amount,
			r.qlt,
			r.ptn,
			r.additional
		)
	})
	const res = await pool.query(
		`INSERT INTO deals (item_id, occurred_at, price, amount, qlt, ptn, additional)
		 VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`,
		params
	)
	const inserted = res.rowCount ?? 0
	if (inserted > 0) auctionHistoryDealsTotal.inc(inserted)
	return inserted
}

const touchItem = async (
	itemDbId: number,
	rows: DealRow[],
	inserted: number
): Promise<void> => {
	const pool = auctionPool()
	if (!pool || rows.length === 0) return
	const times = rows.map((r) => r.time.getTime() / 1000)
	await pool.query(
		`UPDATE items SET
			last_seen = now(),
			deals_count = deals_count + $2,
			hist_newest = GREATEST(COALESCE(hist_newest, '-infinity'), to_timestamp($3)),
			hist_oldest = LEAST(COALESCE(hist_oldest, 'infinity'), to_timestamp($4))
		 WHERE id = $1`,
		[itemDbId, inserted, Math.max(...times), Math.min(...times)]
	)
}

const ensureItems = async (
	dataPaths: string[]
): Promise<
	Map<string, { id: number; histNewest: number | null; hasBackfill: boolean }>
> => {
	const pool = auctionPool()
	if (!pool) return new Map()
	if (dataPaths.length === 0) return new Map()
	const values = dataPaths.map((_, i) => `($${i + 1})`).join(', ')
	await pool.query(
		`INSERT INTO items (data_path) VALUES ${values} ON CONFLICT (data_path) DO NOTHING`,
		dataPaths
	)
	const res = await pool.query(
		`SELECT id, data_path,
			EXTRACT(EPOCH FROM hist_newest) AS hist_newest,
			hist_oldest IS NOT NULL AS has_backfill
		 FROM items WHERE data_path = ANY($1)`,
		[dataPaths]
	)
	const map = new Map<
		string,
		{ id: number; histNewest: number | null; hasBackfill: boolean }
	>()
	for (const row of res.rows as {
		id: number
		data_path: string
		hist_newest: string | null
		has_backfill: boolean
	}[]) {
		map.set(row.data_path, {
			id: row.id,
			histNewest: row.hist_newest ? Number(row.hist_newest) * 1000 : null,
			hasBackfill: row.has_backfill,
		})
	}
	return map
}

const listUniverse = async (): Promise<{ id: string; dataPath: string }[]> => {
	const listing = await loadListing()
	return Object.entries(listing).map(([id, item]) => ({
		id,
		dataPath: normalizeDataPath(item.data),
	}))
}

const runPool = async <T>(
	jobs: T[],
	concurrency: number,
	worker: (job: T) => Promise<void>
): Promise<void> => {
	let i = 0
	const lanes = Array.from(
		{ length: Math.max(1, Math.min(concurrency, jobs.length)) },
		async () => {
			while (i < jobs.length) {
				const job = jobs[i++]
				await worker(job)
			}
		}
	)
	await Promise.all(lanes)
}

export const backfillOnce = async (): Promise<IngestStats> => {
	const stats = emptyStats()
	if (!isAuctionDbEnabled() || running) {
		stats.finishedAt = Date.now()
		return stats
	}
	running = true
	try {
		const universe = await listUniverse()
		const known = await ensureItems(universe.map((u) => u.dataPath))

		const pending = universe.filter((u) => {
			const k = known.get(u.dataPath)
			return k !== undefined && !k.hasBackfill
		})
		console.log(
			`[AuctionHistory] backfill: ${pending.length}/${universe.length} items need walk`
		)

		await runPool(pending, env.AUCTION_BACKFILL_CONCURRENCY, async (u) => {
			const k = known.get(u.dataPath)
			if (!k) return
			stats.items++
			try {
				let offset = 0
				let collected = 0
				for (;;) {
					const page = await fetchHistoryPage(
						u.id,
						HISTORY_LIMIT,
						offset,
						'backfill',
						env.AUCTION_BACKFILL_DELAY_MS
					)
					stats.pages++
					const rows = (page.prices ?? [])
						.map(toRow)
						.filter((r): r is DealRow => r !== null)
					if (rows.length > 0) {
						const inserted = await upsertRows(k.id, rows)
						await touchItem(k.id, rows, inserted)
						stats.rows += rows.length
						stats.inserted += inserted
					}
					collected += rows.length
					offset += HISTORY_LIMIT
					if (rows.length < HISTORY_LIMIT) break
					if (collected >= env.AUCTION_BACKFILL_CAP) break
				}
			} catch (err) {
				stats.failed++
				console.error(
					`[AuctionHistory] backfill failed for ${u.id}:`,
					err instanceof Error ? err.message : err
				)
			}
		})
	} finally {
		running = false
	}

	stats.finishedAt = Date.now()
	lastBackfill = stats
	console.log(
		`[AuctionHistory] backfill done: items=${stats.items} pages=${stats.pages} rows=${stats.rows} inserted=${stats.inserted} failed=${stats.failed}`
	)
	return stats
}

export const sweepOnce = async (): Promise<IngestStats> => {
	const stats = emptyStats()
	if (!isAuctionDbEnabled() || running) {
		stats.finishedAt = Date.now()
		return stats
	}
	running = true
	try {
		const universe = await listUniverse()
		const known = await ensureItems(universe.map((u) => u.dataPath))

		await runPool(universe, env.AUCTION_SWEEP_CONCURRENCY, async (u) => {
			const k = known.get(u.dataPath)
			if (!k) return
			stats.items++
			try {
				let pages = 0
				for (;;) {
					const page = await fetchHistoryPage(
						u.id,
						HISTORY_LIMIT,
						pages * HISTORY_LIMIT,
						'sweep',
						env.AUCTION_SWEEP_DELAY_MS
					)
					stats.pages++
					pages++
					const rows = (page.prices ?? [])
						.map(toRow)
						.filter((r): r is DealRow => r !== null)
					if (rows.length > 0) {
						const inserted = await upsertRows(k.id, rows)
						await touchItem(k.id, rows, inserted)
						stats.rows += rows.length
						stats.inserted += inserted
					}
					if (rows.length < HISTORY_LIMIT) break
					if (pages >= env.AUCTION_SWEEP_MAX_PAGES) break
					const minTime = Math.min(
						...rows.map((r) => r.time.getTime())
					)
					if (k.histNewest !== null && minTime <= k.histNewest) break
				}
			} catch (err) {
				stats.failed++
				console.error(
					`[AuctionHistory] sweep failed for ${u.id}:`,
					err instanceof Error ? err.message : err
				)
			}
		})
	} finally {
		running = false
	}

	stats.finishedAt = Date.now()
	lastSweep = stats
	console.log(
		`[AuctionHistory] sweep done: items=${stats.items} pages=${stats.pages} rows=${stats.rows} inserted=${stats.inserted} failed=${stats.failed}`
	)
	return stats
}
