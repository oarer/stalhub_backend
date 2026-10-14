import { env } from '@/env'
import { auctionPool } from './auction-db'

export interface AuctionHistoryProgress {
	items: {
		total: number
		backfilled: number
		pending: number
		backfillPct: number
		capped: number
	}
	deals: {
		total: number

		oldest: string | null
		newest: string | null
	}
	size: {
		db: string
		deals: string
	}
	top: { dataPath: string; deals: number }[]
}

export const auctionProgress = async (): Promise<AuctionHistoryProgress | null> => {
	const pool = auctionPool()
	if (!pool) return null

	const [itemsRes, topRes, sizeRes, cappedRes] = await Promise.all([
		pool.query(
			`SELECT count(*)::int AS total,
				count(*) FILTER (WHERE hist_oldest IS NOT NULL)::int AS backfilled,
				COALESCE(sum(deals_count), 0)::bigint AS deals,
				min(hist_oldest) AS oldest,
				max(hist_newest) AS newest
			 FROM items`
		),
		pool.query(
			`SELECT data_path AS "dataPath", deals_count::bigint AS deals
			 FROM items ORDER BY deals_count DESC LIMIT 10`
		),
		pool.query(
			`SELECT (SELECT pg_size_pretty(COALESCE(sum(total_bytes), 0)::bigint)
			 FROM hypertable_detailed_size('deals')) AS deals,
			 pg_size_pretty(pg_database_size(current_database())) AS db`
		),
		pool.query(
			`SELECT count(*)::int AS capped FROM items WHERE deals_count >= $1`,
			[env.AUCTION_BACKFILL_CAP]
		),
	])

	const items = itemsRes.rows[0] as {
		total: number
		backfilled: number
		deals: string
		oldest: Date | null
		newest: Date | null
	}
	const backfilled = items.backfilled
	const pending = items.total - backfilled
	const capped = (cappedRes.rows[0] as { capped: number }).capped

	return {
		items: {
			total: items.total,
			backfilled,
			pending,
			backfillPct:
				items.total > 0
					? Math.round((backfilled / items.total) * 1000) / 10
					: 0,
			capped,
		},
		deals: {
			total: Number(items.deals),
			oldest: items.oldest ? items.oldest.toISOString() : null,
			newest: items.newest ? items.newest.toISOString() : null,
		},
		size: sizeRes.rows[0] as { db: string; deals: string },
		top: (topRes.rows as { dataPath: string; deals: string }[]).map(
			(r) => ({ dataPath: r.dataPath, deals: Number(r.deals) })
		),
	}
}
