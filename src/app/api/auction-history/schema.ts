import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Counter } from 'prom-client'
import { register } from '@/app/api/metrics'
import { env } from '@/env'
import { auctionPool, isAuctionDbEnabled } from './auction-db'

export const auctionHistoryDealsTotal = new Counter({
	name: 'auction_history_deals_total',
	help: 'Deals inserted into auction history DB (deduplicated)',
	registers: [register],
})

export const auctionHistoryRequestsTotal = new Counter({
	name: 'auction_history_ingest_requests_total',
	help: 'EXBO history requests made by auction ingest',
	labelNames: ['kind'],
	registers: [register],
})

let schemaApplied = false

const dbTargetHint = (): string => {
	try {
		const u = new URL(env.AUCTION_DATABASE_URL)
		return `${u.hostname}:${u.port || '5432'}${u.pathname}`
	} catch {
		return '<invalid AUCTION_DATABASE_URL>'
	}
}

export const applyAuctionSchema = async (): Promise<boolean> => {
	if (!isAuctionDbEnabled() || schemaApplied) return isAuctionDbEnabled()
	const pool = auctionPool()
	if (!pool) return false
	try {
		const sql = await readFile(
			join(process.cwd(), 'auction-db', 'schema.sql'),
			'utf8'
		)
		await pool.query(sql)
		schemaApplied = true
		console.log('[AuctionHistory] schema applied')
		return true
	} catch (err) {
		const msg =
			err instanceof Error ? err.message.split('\n')[0] : String(err)
		console.error(
			`[AuctionHistory] schema apply failed (${dbTargetHint()}): ${msg}. `
		)
		return false
	}
}
