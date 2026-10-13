import { Pool } from 'pg'
import { env } from '@/env'

let pool: Pool | null = null

export const auctionPool = (): Pool | null => {
	if (!env.AUCTION_DATABASE_URL) return null
	if (!pool) {
		pool = new Pool({
			connectionString: env.AUCTION_DATABASE_URL,
			max: 4,
		})
		pool.on('error', (err) =>
			console.error(
				'[AuctionHistory] pool error:',
				err instanceof Error ? err.message : String(err)
			)
		)
	}
	return pool
}

export const isAuctionDbEnabled = (): boolean => auctionPool() !== null
