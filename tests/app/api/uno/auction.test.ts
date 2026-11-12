import { describe, expect, test } from 'bun:test'
import {
	AUCTION_LOT_MIN_AGE_SECONDS,
	filterMatureLots,
	matureLotsPage,
} from '@/app/api/uno/auction'
import type { UnoAuctionLot } from '@/types/uno.type'

function lotWithStart(startTime: string | null): UnoAuctionLot {
	return {
		itemId: 'item_1',
		amount: 1,
		startPrice: 100,
		startTime,
		endTime: null,
	}
}

describe('UNO auction lot maturity filter', () => {
	const NOW_MS = 1_700_000_000_000

	test('keeps the 5 minute threshold explicit', () => {
		expect(AUCTION_LOT_MIN_AGE_SECONDS).toBe(300)
	})

	test('drops fresh lots listed now', () => {
		const lot = lotWithStart(new Date(NOW_MS).toISOString())
		expect(filterMatureLots([lot], NOW_MS)).toEqual([])
	})

	test('keeps lots older than 10 minutes', () => {
		const lot = lotWithStart(new Date(NOW_MS - 10 * 60_000).toISOString())
		expect(filterMatureLots([lot], NOW_MS)).toEqual([lot])
	})

	test('keeps lots exactly 300 seconds old', () => {
		const lot = lotWithStart(
			new Date(NOW_MS - AUCTION_LOT_MIN_AGE_SECONDS * 1000).toISOString()
		)
		expect(filterMatureLots([lot], NOW_MS)).toEqual([lot])
	})

	test('drops lots one millisecond younger than the threshold', () => {
		const lot = lotWithStart(
			new Date(
				NOW_MS - AUCTION_LOT_MIN_AGE_SECONDS * 1000 + 1
			).toISOString()
		)
		expect(filterMatureLots([lot], NOW_MS)).toEqual([])
	})

	test('drops lots with unknown start time', () => {
		expect(filterMatureLots([lotWithStart(null)], NOW_MS)).toEqual([])
	})

	test('matures the page and reports the filtered total', () => {
		const startSec = 1_700_000_000
		const oldLot = {
			lot_id: 1,
			item_id: 1,
			date_start_sec: startSec - 600,
		}
		const freshLot = {
			lot_id: 2,
			item_id: 2,
			date_start_sec: startSec,
		}
		const unknownLot = { lot_id: 3, item_id: 3 }

		const page = matureLotsPage(
			{ total: 3, lots: [oldLot, freshLot, unknownLot] },
			startSec * 1000
		)

		expect(page.total).toBe(1)
		expect(page.lots).toHaveLength(1)
		expect(page.lots[0]?.itemId).toBe('1')
	})
})
