import { cron } from '@elysia/cron'
import { env } from '@/env'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { auctionPool, isAuctionDbEnabled } from './auction-db'
import {
	backfillOnce,
	deepenOnce,
	ingestStatus,
	runCensusOnce,
	sweepOnce,
} from './ingest'
import { auctionProgress } from './progress'
import { rollupStatus, runRollupOnce } from './rollup'
import { applyAuctionSchema } from './schema'

export const routeAuctionHistory = createElysia()
	.use(jwtPlugin)
	.use(
		cron({
			name: 'auction-history-sweep',
			pattern: env.AUCTION_SWEEP_CRON,
			timezone: 'Europe/Moscow',
			run: () => {
				sweepOnce().catch((err) =>
					console.error('[AuctionHistory] sweep cron failed:', err)
				)
			},
		})
	)
	.use(
		cron({
			name: 'auction-history-rollup',
			pattern: env.AUCTION_ROLLUP_CRON,
			timezone: 'Europe/Moscow',
			run: () => {
				runRollupOnce().catch((err) =>
					console.error('[AuctionHistory] rollup cron failed:', err)
				)
			},
		})
	)
	.setup(async () => {
		if (!isAuctionDbEnabled()) {
			console.log('[AuctionHistory] disabled (no AUCTION_DATABASE_URL)')
			return
		}
		const ok = await applyAuctionSchema()
		if (!ok) {
			setTimeout(
				() =>
					applyAuctionSchema()
						.then((retryOk) => {
							if (retryOk) backfillOnce().catch(() => {})
						})
						.catch(() => {}),
				60_000
			)
			return
		}

		backfillOnce().catch((err) =>
			console.error('[AuctionHistory] initial backfill failed:', err)
		)
	})
	.get('/auction-history/status', async ({ status }: any) => {
		const st = { ...ingestStatus(), ...rollupStatus() }
		if (!st.enabled) {
			return status(503, {
				status: 503,
				message: 'Auction history DB not configured',
			})
		}
		const pool = auctionPool()
		let db: Record<string, unknown> = {}
		if (pool) {
			try {
				const [items, size] = await Promise.all([
					pool.query(
						'SELECT count(*)::int AS items, COALESCE(sum(deals_count),0)::bigint AS deals FROM items'
					),
					pool.query(
						`SELECT (SELECT pg_size_pretty(COALESCE(sum(total_bytes), 0)::bigint)
						 FROM hypertable_detailed_size('deals')) AS deals_size,
						 pg_size_pretty(pg_database_size(current_database())) AS db_size`
					),
				])
				db = { ...items.rows[0], ...size.rows[0] }
			} catch (err) {
				db = {
					error: err instanceof Error ? err.message : 'db error',
				}
			}
		}
		return { ...st, db }
	})
	.get(
		'/auction-history/progress',
		{
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		},
		async ({ status }: any) => {
			const [progress, st] = await Promise.all([
				auctionProgress().catch((err) => {
					console.error(
						'[AuctionHistory] progress failed:',
						err instanceof Error ? err.message : String(err)
					)
					return null
				}),
				{ ...ingestStatus(), ...rollupStatus() },
			])
			if (!progress) {
				return status(503, {
					status: 503,
					message: 'Auction history DB not available',
				})
			}
			return { ...progress, ...st }
		}
	)
	.post(
		'/auction-history/deepen',
		{
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		},
		async ({ status }: any) => {
			const st = { ...ingestStatus(), ...rollupStatus() }
			if (!st.enabled) {
				return status(503, {
					status: 503,
					message: 'Auction history DB not configured',
				})
			}
			if (st.running || st.deepening) {
				return status(409, {
					status: 409,
					message: 'Ingest already running',
				})
			}

			deepenOnce().catch((err) =>
				console.error('[AuctionHistory] deepen failed:', err)
			)
			return { started: true }
		}
	)
	.post(
		'/auction-history/census',
		{
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		},
		async ({ status }: any) => {
			const st = { ...ingestStatus(), ...rollupStatus() }
			if (st.censusRunning) {
				return status(409, {
					status: 409,
					message: 'Census already running',
				})
			}

			runCensusOnce().catch((err) =>
				console.error('[AuctionHistory] census failed:', err)
			)
			return { started: true }
		}
	)
	.post(
		'/auction-history/rollup',
		{
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		},
		async ({ status }: any) => {
			const st = { ...ingestStatus(), ...rollupStatus() }
			if (st.rollupRunning) {
				return status(409, {
					status: 409,
					message: 'Rollup already running',
				})
			}

			runRollupOnce().catch((err) =>
				console.error('[AuctionHistory] rollup failed:', err)
			)
			return { started: true }
		}
	)
