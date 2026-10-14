import { join } from 'node:path'
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
	buyer: string
}

export const unitPriceOf = (price: number, amount: number): number => {
	const v = amount > 0 ? price / amount : price
	return Math.round(v * 100) / 100
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

	const amount =
		Number.isInteger(h.amount) && (h.amount as number) >= 1
			? (h.amount as number)
			: 1
	const add = (h.additional ?? {}) as Record<string, unknown>
	const qlt =
		typeof add.qlt === 'number' && Number.isInteger(add.qlt) ? add.qlt : -1
	const ptn =
		typeof add.ptn === 'number' && Number.isInteger(add.ptn) ? add.ptn : 0
	const raw = JSON.stringify(h.additional ?? {})
	const buyer =
		typeof add.buyer === 'string' && add.buyer.length > 0 ? add.buyer : ''
	return {
		time,
		price,
		amount,
		qlt,
		ptn,
		additional: raw === '{}' ? null : raw,
		buyer,
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
let lastDeepen: IngestStats | null = null
let running = false
let deepening = false
let censusRunning = false

export interface AuctionCensus {
	startedAt: number
	finishedAt: number
	items: number
	withHistory: number
	withoutHistory: number
	failed: number
	exboDeals: number
	buckets: { label: string; count: number }[]
	top: { id: string; total: number }[]
}

let lastCensus: AuctionCensus | null = null

export const ingestStatus = (): {
	enabled: boolean
	running: boolean
	deepening: boolean
	censusRunning: boolean
	lastSweep: IngestStats | null
	lastBackfill: IngestStats | null
	lastDeepen: IngestStats | null
	lastCensus: AuctionCensus | null
} => ({
	enabled: isAuctionDbEnabled(),
	running,
	deepening,
	censusRunning,
	lastSweep,
	lastBackfill,
	lastDeepen,
	lastCensus,
})

const upsertRows = async (
	itemDbId: number,
	rows: DealRow[]
): Promise<number> => {
	const pool = auctionPool()
	if (!pool || rows.length === 0) return 0
	// чанки hypertable создаются сам TimescaleDB
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

type BucketGroup = {
	day: string
	qlt: number
	ptn: number
	unit: number
	amount: number
	buyer: string
	trades: number
	units: number
}

const upsertBuckets = async (
	itemDbId: number,
	rows: DealRow[]
): Promise<number> => {
	const pool = auctionPool()
	if (!pool || rows.length === 0) return 0
	const groups = new Map<string, BucketGroup>()
	for (const r of rows) {
		const day = r.time.toISOString().slice(0, 10)
		const unit = unitPriceOf(r.price, r.amount)
		const key = `${day}|${r.qlt}|${r.ptn}|${unit.toFixed(2)}|${r.amount}|${r.buyer}`
		const g = groups.get(key)
		if (g) {
			g.trades += 1
			g.units += r.amount
		} else {
			groups.set(key, {
				day,
				qlt: r.qlt,
				ptn: r.ptn,
				unit,
				amount: r.amount,
				buyer: r.buyer,
				trades: 1,
				units: r.amount,
			})
		}
	}
	const list = [...groups.values()]
	const values: string[] = []
	const params: unknown[] = []
	list.forEach((g, i) => {
		const o = i * 9
		values.push(
			`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9})`
		)
		params.push(
			itemDbId,
			g.day,
			g.qlt,
			g.ptn,
			g.unit,
			g.amount,
			g.buyer,
			g.trades,
			g.units
		)
	})
	await pool.query(
		`INSERT INTO deal_buckets
		 (item_id, day, qlt, ptn, unit_price, amount, buyer, trades, units)
		 VALUES ${values.join(', ')}
		 ON CONFLICT (item_id, day, qlt, ptn, unit_price, amount, buyer)
		 DO UPDATE SET trades = deal_buckets.trades + EXCLUDED.trades,
			units = deal_buckets.units + EXCLUDED.units`,
		params
	)
	return list.length
}

type HourGroup = {
	day: string
	hour: number
	qlt: number
	ptn: number
	trades: number
	units: number
	vol: number
	low: number
	high: number
}

const upsertHours = async (
	itemDbId: number,
	rows: DealRow[]
): Promise<number> => {
	const pool = auctionPool()
	if (!pool || rows.length === 0) return 0
	const groups = new Map<string, HourGroup>()
	for (const r of rows) {
		const day = r.time.toISOString().slice(0, 10)
		const hour = r.time.getUTCHours()
		const unit = unitPriceOf(r.price, r.amount)
		const key = `${day}|${hour}|${r.qlt}|${r.ptn}`
		const g = groups.get(key)
		if (g) {
			g.trades += 1
			g.units += r.amount
			g.vol = Math.round((g.vol + unit * r.amount) * 100) / 100
			if (unit < g.low) g.low = unit
			if (unit > g.high) g.high = unit
		} else {
			groups.set(key, {
				day,
				hour,
				qlt: r.qlt,
				ptn: r.ptn,
				trades: 1,
				units: r.amount,
				vol: Math.round(unit * r.amount * 100) / 100,
				low: unit,
				high: unit,
			})
		}
	}
	const list = [...groups.values()]
	const values: string[] = []
	const params: unknown[] = []
	list.forEach((g, i) => {
		const o = i * 10
		values.push(
			`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10})`
		)
		params.push(
			itemDbId,
			g.day,
			g.hour,
			g.qlt,
			g.ptn,
			g.trades,
			g.units,
			g.vol,
			g.low,
			g.high
		)
	})
	await pool.query(
		`INSERT INTO deal_hours
		 (item_id, day, hour, qlt, ptn, trades, units, volume, low, high)
		 VALUES ${values.join(', ')}
		 ON CONFLICT (item_id, day, hour, qlt, ptn)
		 DO UPDATE SET trades = deal_hours.trades + EXCLUDED.trades,
			units = deal_hours.units + EXCLUDED.units,
			volume = deal_hours.volume + EXCLUDED.volume,
			low = LEAST(deal_hours.low, EXCLUDED.low),
			high = GREATEST(deal_hours.high, EXCLUDED.high)`,
		params
	)
	return list.length
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
						await upsertBuckets(k.id, rows)
						await upsertHours(k.id, rows)
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
		// горячие вперёд: при длинном проходе свежие данные горячих
		// предметов всё равно снимаются первыми, холодные подождут.
		// NULL (новый предмет без вотермарка) — самым первым.
		const ordered = [...universe].sort((a, b) => {
			const ha = known.get(a.dataPath)?.histNewest ?? null
			const hb = known.get(b.dataPath)?.histNewest ?? null
			if (ha === null && hb === null) return 0
			if (ha === null) return -1
			if (hb === null) return 1
			return hb - ha
		})

		await runPool(ordered, env.AUCTION_SWEEP_CONCURRENCY, async (u) => {
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
						await upsertBuckets(k.id, rows)
						await upsertHours(k.id, rows)
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

/**
 * Deepen: добор глубины для горячих предметов, упёршихся в бэкфилл-кэп
 * (deals_count >= BACKFILL_CAP — у них окно всего часы/дни, а для
 * медианы-90д и спроса нужны недели). Идём от offset 0 вниз:
 * пересечение с известным окном гасится дедупом, стоп — по кэпу,
 * короткой странице или возрасту старше DEEPEN_MAX_AGE_DAYS.
 * Фронтир hist_oldest при этом отъезжает вниз через touchItem.
 * Запускается вручную из админки (тяжёлая операция).
 */
export const deepenOnce = async (topN?: number): Promise<IngestStats> => {
	const stats = emptyStats()
	if (!isAuctionDbEnabled() || running || deepening) {
		stats.finishedAt = Date.now()
		return stats
	}
	const pool = auctionPool()
	if (!pool) {
		stats.finishedAt = Date.now()
		return stats
	}
	deepening = true
	try {
		const limit = topN ?? env.AUCTION_DEEPEN_TOP
		const cutoff = Date.now() - env.AUCTION_DEEPEN_MAX_AGE_DAYS * 86400_000
		const res = await pool.query(
			`SELECT id, data_path AS "dataPath", deals_count::bigint AS deals
			 FROM items WHERE deals_count >= $1
			 ORDER BY deals_count DESC LIMIT $2`,
			[String(env.AUCTION_BACKFILL_CAP), limit]
		)
		const jobs = res.rows as {
			id: number
			dataPath: string
			deals: string
		}[]
		console.log(`[AuctionHistory] deepen: ${jobs.length} hot items`)

		await runPool(jobs, env.AUCTION_DEEPEN_CONCURRENCY, async (job) => {
			const itemId = idFromDataPath(job.dataPath)
			stats.items++
			try {
				let offset = 0
				let collected = 0
				for (;;) {
					const page = await fetchHistoryPage(
						itemId,
						HISTORY_LIMIT,
						offset,
						'backfill',
						env.AUCTION_DEEPEN_DELAY_MS
					)
					stats.pages++
					const rows = (page.prices ?? [])
						.map(toRow)
						.filter((r): r is DealRow => r !== null)
					if (rows.length > 0) {
						const inserted = await upsertRows(job.id, rows)
						await touchItem(job.id, rows, inserted)
						await upsertBuckets(job.id, rows)
						await upsertHours(job.id, rows)
						stats.rows += rows.length
						stats.inserted += inserted
					}
					collected += rows.length
					offset += HISTORY_LIMIT
					if (rows.length < HISTORY_LIMIT) break
					if (collected >= env.AUCTION_DEEPEN_CAP) break
					if (
						rows.length > 0 &&
						Math.min(...rows.map((r) => r.time.getTime())) < cutoff
					)
						break
				}
			} catch (err) {
				stats.failed++
				console.error(
					`[AuctionHistory] deepen failed for ${itemId}:`,
					err instanceof Error ? err.message : err
				)
			}
		})
	} finally {
		deepening = false
	}

	stats.finishedAt = Date.now()
	lastDeepen = stats
	console.log(
		`[AuctionHistory] deepen done: items=${stats.items} pages=${stats.pages} rows=${stats.rows} inserted=${stats.inserted} failed=${stats.failed}`
	)
	return stats
}

const CENSUS_BUCKETS: { label: string; min: number; max: number }[] = [
	{ label: '0', min: 0, max: 0 },
	{ label: '1–10', min: 1, max: 10 },
	{ label: '11–100', min: 11, max: 100 },
	{ label: '101–1K', min: 101, max: 1000 },
	{ label: '1K–10K', min: 1001, max: 10000 },
	{ label: '10K–100K', min: 10001, max: 100000 },
	{ label: '100K–1M', min: 100001, max: 1000000 },
	{ label: '1M+', min: 1000001, max: Number.POSITIVE_INFINITY },
]

/**
 * Перепись: по 1 запросу (limit=1) на предмет забираем history.total —
 * кто есть в истории EXBO, кто нет, и суммарная глубина.
 * Ничего не пишет в БД, только runtime/auction-census.json + память.
 * Идёт параллельно со свипом (квоты делит gateway).
 */
export const runCensusOnce = async (): Promise<AuctionCensus> => {
	if (censusRunning) {
		return (
			lastCensus ?? {
				startedAt: Date.now(),
				finishedAt: 0,
				items: 0,
				withHistory: 0,
				withoutHistory: 0,
				failed: 0,
				exboDeals: 0,
				buckets: [],
				top: [],
			}
		)
	}
	censusRunning = true
	const startedAt = Date.now()
	const totals = new Map<string, number>()
	let failed = 0
	try {
		const universe = await listUniverse()
		await runPool(universe, env.AUCTION_BACKFILL_CONCURRENCY, async (u) => {
			try {
				const page = await fetchHistoryPage(
					u.id,
					1,
					0,
					'backfill',
					env.AUCTION_BACKFILL_DELAY_MS
				)
				totals.set(u.id, Number(page.total ?? 0))
			} catch (err) {
				failed++
				console.error(
					`[AuctionHistory] census failed for ${u.id}:`,
					err instanceof Error ? err.message : err
				)
			}
		})

		const counts = CENSUS_BUCKETS.map((b) => ({ label: b.label, count: 0 }))
		let withHistory = 0
		let exboDeals = 0
		const top: { id: string; total: number }[] = []
		for (const [id, total] of totals) {
			if (total > 0) withHistory++
			exboDeals += total
			const bucket = CENSUS_BUCKETS.findIndex(
				(b) => total >= b.min && total <= b.max
			)
			if (bucket >= 0) counts[bucket].count++
			top.push({ id, total })
		}
		top.sort((a, b) => b.total - a.total)

		lastCensus = {
			startedAt,
			finishedAt: Date.now(),
			items: totals.size,
			withHistory,
			withoutHistory: totals.size - withHistory,
			failed,
			exboDeals,
			buckets: counts,
			top: top.slice(0, 30),
		}
		try {
			const { writeFile, mkdir } = await import('node:fs/promises')
			await mkdir(join(process.cwd(), 'runtime'), { recursive: true })
			await writeFile(
				join(process.cwd(), 'runtime', 'auction-census.json'),
				JSON.stringify({ ...lastCensus, top: top.slice(0, 200) })
			)
		} catch (err) {
			console.error(
				'[AuctionHistory] census snapshot failed:',
				err instanceof Error ? err.message : err
			)
		}
		console.log(
			`[AuctionHistory] census done: items=${lastCensus.items} withHistory=${withHistory} exboDeals=${exboDeals} failed=${failed}`
		)
		return lastCensus
	} finally {
		censusRunning = false
	}
}
