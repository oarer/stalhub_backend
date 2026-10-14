import { auctionPool, isAuctionDbEnabled } from './auction-db'

export interface RollupStats {
	startedAt: number
	finishedAt: number
	days: number
}

let lastRollup: RollupStats | null = null
let rollupRunning = false

export const rollupStatus = (): {
	rollupRunning: boolean
	lastRollup: RollupStats | null
} => ({ rollupRunning, lastRollup })

const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

export const rollupDay = async (day: string): Promise<void> => {
	const pool = auctionPool()
	if (!pool) return

	await pool.query(
		`INSERT INTO buyer_daily (item_id, day, buyer, trades, units, volume)
		 SELECT item_id, day, buyer, sum(trades), sum(units), sum(unit_price * units)
		 FROM deal_buckets WHERE day = $1
		 GROUP BY item_id, day, buyer
		 ON CONFLICT (item_id, day, buyer)
		 DO UPDATE SET trades = EXCLUDED.trades, units = EXCLUDED.units,
			volume = EXCLUDED.volume`,
		[day]
	)

	await pool.query(
		`INSERT INTO candles_daily
		 (item_id, day, qlt, ptn, trades, amount, avg, low, high,
		  median, stddev, p10, p25, p75, p90, buyers)
		 WITH b AS (
			SELECT item_id, qlt, ptn, unit_price, trades, units, buyer
			FROM deal_buckets WHERE day = $1
		 ),
		 a AS (
			SELECT item_id, qlt, ptn,
				sum(trades) AS trades, sum(units) AS units,
				sum(unit_price * units) AS money,
				min(unit_price) AS low, max(unit_price) AS high,
				count(DISTINCT buyer) FILTER (WHERE buyer <> '') AS buyers
			FROM b GROUP BY item_id, qlt, ptn
		 ),
		 c AS (
			SELECT b.item_id, b.qlt, b.ptn, b.unit_price, b.units,
				sum(b.units) OVER (
					PARTITION BY b.item_id, b.qlt, b.ptn ORDER BY b.unit_price
					ROWS UNBOUNDED PRECEDING) AS cum,
				a.units AS u, (a.money / a.units) AS avg
			FROM b JOIN a USING (item_id, qlt, ptn)
		 ),
		 p AS (
			SELECT item_id, qlt, ptn,
				min(unit_price) FILTER (WHERE cum >= ceil(u * 0.5)) AS median,
				min(unit_price) FILTER (WHERE cum >= ceil(u * 0.1)) AS p10,
				min(unit_price) FILTER (WHERE cum >= ceil(u * 0.25)) AS p25,
				min(unit_price) FILTER (WHERE cum >= ceil(u * 0.75)) AS p75,
				min(unit_price) FILTER (WHERE cum >= ceil(u * 0.9)) AS p90,
				sqrt(sum(units * power(unit_price - avg, 2)) / max(u)) AS stddev
			FROM c GROUP BY item_id, qlt, ptn
		 )
		 SELECT a.item_id, $1::date, a.qlt, a.ptn, a.trades, a.units,
			round(a.money / a.units, 2), a.low, a.high,
			p.median, round(COALESCE(p.stddev, 0), 2),
			p.p10, p.p25, p.p75, p.p90, COALESCE(a.buyers, 0)
		 FROM a JOIN p USING (item_id, qlt, ptn)
		 ON CONFLICT (item_id, day, qlt, ptn)
		 DO UPDATE SET trades = EXCLUDED.trades, amount = EXCLUDED.amount,
			avg = EXCLUDED.avg, low = EXCLUDED.low, high = EXCLUDED.high,
			median = EXCLUDED.median, stddev = EXCLUDED.stddev,
			p10 = EXCLUDED.p10, p25 = EXCLUDED.p25, p75 = EXCLUDED.p75,
			p90 = EXCLUDED.p90, buyers = EXCLUDED.buyers`,
		[day]
	)
}

/** Витрина item_stats: deals_90d, demand, median_90d (exact, units-weighted). */
export const refreshItemStats = async (): Promise<void> => {
	const pool = auctionPool()
	if (!pool) return

	await pool.query(
		`INSERT INTO item_stats (item_id, qlt, ptn, median_90d, deals_90d, demand, updated_at)
		 WITH b AS (
			SELECT item_id, qlt, ptn, unit_price, trades, units, day
			FROM deal_buckets
			WHERE day >= CURRENT_DATE - INTERVAL '90 days'
		 ),
		 c AS (
			SELECT item_id, qlt, ptn, unit_price, trades, units, day,
				sum(units) OVER (
					PARTITION BY item_id, qlt, ptn ORDER BY unit_price
					ROWS UNBOUNDED PRECEDING) AS cum,
				sum(units) OVER (PARTITION BY item_id, qlt, ptn) AS u
			FROM b
		 )
		 SELECT item_id, qlt, ptn,
			min(unit_price) FILTER (WHERE cum >= ceil(u * 0.5)),
			sum(trades),
			round(
				(sum(trades) FILTER (WHERE day >= CURRENT_DATE - INTERVAL '7 days'))::numeric /
				NULLIF((sum(trades) FILTER (WHERE day >= CURRENT_DATE - INTERVAL '63 days'
					AND day < CURRENT_DATE - INTERVAL '7 days'))::numeric / 8, 0),
				3),
			now()
		 FROM c
		 GROUP BY item_id, qlt, ptn
		 ON CONFLICT (item_id, qlt, ptn)
		 DO UPDATE SET median_90d = EXCLUDED.median_90d,
			deals_90d = EXCLUDED.deals_90d, demand = EXCLUDED.demand,
			updated_at = EXCLUDED.updated_at`
	)
}

/**
 * Полный прогон: дни из бакетов без свечей + последние 3 дня
 * (туда пишет свип) + item_stats.
 */
export const runRollupOnce = async (): Promise<RollupStats> => {
	const stats: RollupStats = { startedAt: Date.now(), finishedAt: 0, days: 0 }
	if (!isAuctionDbEnabled() || rollupRunning) {
		stats.finishedAt = Date.now()
		return stats
	}
	rollupRunning = true
	try {
		const pool = auctionPool()
		if (!pool) {
			stats.finishedAt = Date.now()
			return stats
		}
		const missing = await pool.query(
			`SELECT DISTINCT day::text AS day FROM deal_buckets
			 WHERE day < CURRENT_DATE
			 EXCEPT
			 SELECT DISTINCT day::text FROM candles_daily
			 ORDER BY day`
		)
		const days = new Set<string>(
			(missing.rows as { day: string }[]).map((r) => r.day)
		)
		for (let back = 3; back >= 1; back--) {
			const d = new Date(Date.now() - back * 86400_000)
			days.add(isoDay(d))
		}
		days.delete(isoDay(new Date()))
		for (const day of [...days].sort()) {
			await rollupDay(day)
			stats.days++
		}
		await refreshItemStats()
	} finally {
		rollupRunning = false
	}
	stats.finishedAt = Date.now()
	lastRollup = stats
	console.log(`[AuctionHistory] rollup done: days=${stats.days}`)
	return stats
}
