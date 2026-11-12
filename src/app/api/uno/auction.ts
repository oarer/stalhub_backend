import { t } from 'elysia'
import type {
	UnoAuctionLot,
	UnoAuctionLotsResponse,
	UnoRawAuctionPage,
} from '@/types/uno.type'
import { createElysia } from '@/utils/elysia'
import { respond, unoService } from './service'

const MAX_ITEM_IDS = 5

export const AUCTION_LOT_MIN_AGE_SECONDS = 300

const unoAuctionQuery = t.Object({
	item_id: t.Optional(t.Numeric({ minimum: 0 })),
	item_ids: t.Optional(t.String({ maxLength: 2048 })),
	limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
	offset: t.Optional(t.Numeric({ minimum: 0, maximum: 1_000_000 })),
	sort: t.Optional(t.Numeric({ minimum: 0, maximum: 3 })),
	descending: t.Optional(t.Boolean()),
	rarity: t.Optional(t.String({ maxLength: 64 })),
	category: t.Optional(t.String({ maxLength: 64 })),
	region: t.Optional(t.Union([t.Literal('ru'), t.Literal('eu')])),
})

function lotTime(sec?: number, nano?: number): string | null {
	if (typeof sec !== 'number' || !Number.isFinite(sec)) return null
	const ms = sec * 1000 + Math.floor((nano ?? 0) / 1_000_000)
	return new Date(ms).toISOString()
}

function lotAdditional(raw?: string): Record<string, unknown> | undefined {
	if (!raw) return undefined
	try {
		const parsed: unknown = JSON.parse(raw)
		if (
			parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>
		}
	} catch {
		// not JSON — no structured additional data
	}
	return undefined
}

function toLot(raw: Record<string, unknown>): UnoAuctionLot {
	const buyout = typeof raw.price_buyout === 'number' ? raw.price_buyout : 0
	const current =
		typeof raw.current_price === 'number' ? raw.current_price : undefined
	const additional = lotAdditional(raw.additional as string | undefined)

	return {
		itemId: String(raw.item_id ?? ''),
		amount: typeof raw.stack_size === 'number' ? raw.stack_size : 1,
		startPrice: typeof raw.price_start === 'number' ? raw.price_start : 0,
		...(current !== undefined ? { currentPrice: current } : {}),
		...(buyout > 0 ? { buyoutPrice: buyout } : {}),
		startTime: lotTime(
			raw.date_start_sec as number | undefined,
			raw.date_start_nano as number | undefined
		),
		endTime: lotTime(
			raw.date_end_sec as number | undefined,
			raw.date_end_nano as number | undefined
		),
		...(additional ? { additional } : {}),
	}
}

function normalizeLots(page: UnoRawAuctionPage): UnoAuctionLotsResponse {
	return {
		total:
			typeof page.total === 'number'
				? page.total
				: (page.lots?.length ?? 0),
		lots: (page.lots ?? []).map(toLot),
	}
}

export function filterMatureLots(
	lots: UnoAuctionLot[],
	nowMs: number
): UnoAuctionLot[] {
	const minAgeMs = AUCTION_LOT_MIN_AGE_SECONDS * 1000
	return lots.filter(
		(lot) =>
			lot.startTime !== null &&
			Date.parse(lot.startTime) <= nowMs - minAgeMs
	)
}

export function matureLotsPage(
	page: UnoRawAuctionPage,
	nowMs: number
): UnoAuctionLotsResponse {
	const lots = filterMatureLots(normalizeLots(page).lots, nowMs)
	return { total: lots.length, lots }
}

export const unoAuctionRoutes = createElysia().get(
	'/auction/lots',
	{
		query: unoAuctionQuery,
		detail: { tags: ['UNO'] },
	},
	({ query, set }) =>
		respond(set, async () => {
			const { item_id: itemId, item_ids: itemIds } = query

			if (
				itemIds !== undefined &&
				itemIds.split(',').filter((part) => part.trim() !== '').length >
					MAX_ITEM_IDS
			) {
				set.status = 422
				return {
					error: `item_ids supports at most ${MAX_ITEM_IDS} values`,
				}
			}

			const page = await unoService.request<UnoRawAuctionPage>(
				'/auction/lots',
				{
					item_id: itemId,
					item_ids: itemIds,
					limit: query.limit,
					offset: query.offset,
					sort: query.sort,
					descending: query.descending,
					rarity: query.rarity,
					category: query.category,
					region: query.region,
				}
			)

			return matureLotsPage(page, Date.now())
		})
)
