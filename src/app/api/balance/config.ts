import { resolve } from 'node:path'
import { env } from '@/env'

export const balanceConfig = {
	get listingUrl() {
		return env.SC_DB_LISTING_URL
	},
	get listingDir() {
		return resolve(process.cwd(), env.SC_DB_LISTING_DIR)
	},
	get diffsDir() {
		return resolve(process.cwd(), env.SC_DB_DIFFS_DIR)
	},
	get maxArchiveDiffs() {
		return 5
	},
} as const
