import { t } from 'elysia'
import type { UnoRawPlayer } from '@/types/uno.type'
import { createElysia } from '@/utils/elysia'
import { compactPlayerGear } from './compact'
import { parsePlayerGear } from './gear'
import { compactGridEvent } from './grids'
import { getUnoItemLookup } from './item-db'
import { getSeasonTiers } from './season-tiers'
import { UnoApiError, unoService } from './service'

const FACTION = t.Union([
	t.Literal('duty'),
	t.Literal('freedom'),
	t.Literal('merc'),
	t.Literal('covenant'),
])

const RANK = t.Union([
	t.Literal('S'),
	t.Literal('A'),
	t.Literal('B'),
	t.Literal('C'),
	t.Literal('D'),
	t.Literal('E'),
])

const MODE = t.Union([
	t.Literal('brawl'),
	t.Literal('tournament'),
	t.Literal('base_capture'),
])

const dateRangeQuery = t.Object({
	from: t.Optional(t.String({ format: 'date' })),
	to: t.Optional(t.String({ format: 'date' })),
	date: t.Optional(t.String({ format: 'date' })),
	mode: t.Optional(MODE),
	timezone: t.Optional(t.String({ maxLength: 64 })),
	season: t.Optional(t.String({ maxLength: 64 })),
})

const clanListQuery = t.Object({
	q: t.Optional(t.String({ maxLength: 64 })),
	faction: t.Optional(FACTION),
	rank: t.Optional(RANK),
	limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
	offset: t.Optional(t.Numeric({ minimum: 0, maximum: 10000 })),
})

const leaderboardQuery = t.Object({
	...clanListQuery.properties,
	season: t.Optional(t.String({ maxLength: 64 })),
})

const gridListQuery = t.Object({
	...dateRangeQuery.properties,
})

const gridParams = t.Object({ grid_id: t.String({ format: 'uuid' }) })

const clanParams = t.Object({ clan_id: t.String({ format: 'uuid' }) })

function respond<T>(set: { status?: number | string }, run: () => Promise<T>) {
	return run().catch((error: unknown) => {
		if (error instanceof UnoApiError) {
			set.status = error.status
			return error.payload
		}
		console.error('[uno] unexpected error:', error)
		set.status = 502
		return { error: 'UNO API unavailable' }
	})
}

export const unoRoutes = createElysia().group('/uno', (app) =>
	app
		.get('/player-session', { detail: { tags: ['UNO'] } }, ({ set }) =>
			respond(set, () => unoService.request('/player-session'))
		)
		.get(
			'/players/:nickname',
			{
				params: t.Object({
					nickname: t.String({ minLength: 1, maxLength: 64 }),
				}),
				detail: { tags: ['UNO'] },
			},
			({ params, set }) =>
				respond(set, () =>
					unoService.request(
						`/players/${encodeURIComponent(params.nickname)}`
					)
				)
		)
		.get(
			'/players/:nickname/gear',
			{
				params: t.Object({
					nickname: t.String({ minLength: 1, maxLength: 64 }),
				}),
				detail: { tags: ['UNO'] },
			},
			({ params, set }) =>
				respond(set, async () => {
					const [player, lookup] = await Promise.all([
						unoService.request<UnoRawPlayer>(
							`/players/${encodeURIComponent(params.nickname)}`
						),
						getUnoItemLookup(),
					])
					return compactPlayerGear(parsePlayerGear(player, lookup))
				})
		)
		.get('/health', { detail: { tags: ['UNO'] } }, ({ set }) =>
			respond(set, () => unoService.request('/health'))
		)
		.get(
			'/clans',
			{ query: clanListQuery, detail: { tags: ['UNO'] } },
			({ query, set }) =>
				respond(set, () => unoService.request('/clans', query))
		)
		.get(
			'/leaderboard',
			{ query: leaderboardQuery, detail: { tags: ['UNO'] } },
			({ query, set }) =>
				respond(set, () => unoService.request('/leaderboard', query))
		)
		.get(
			'/season-tiers',
			{
				query: t.Object({
					season: t.String({ minLength: 1, maxLength: 64 }),
				}),
				detail: { tags: ['UNO'] },
			},
			({ query, set }) => respond(set, () => getSeasonTiers(query.season))
		)
		.get(
			'/clans/:clan_id',
			{ params: clanParams, detail: { tags: ['UNO'] } },
			({ params, set }) =>
				respond(set, () =>
					unoService.request(
						`/clans/${encodeURIComponent(params.clan_id)}`
					)
				)
		)
		.get(
			'/clans/:clan_id/history',
			{
				params: clanParams,
				query: dateRangeQuery,
				detail: { tags: ['UNO'] },
			},
			({ params, query, set }) =>
				respond(set, () =>
					unoService.request(
						`/clans/${encodeURIComponent(params.clan_id)}/history`,
						query
					)
				)
		)
		.get(
			'/clans/:clan_id/analytics',
			{
				params: clanParams,
				query: dateRangeQuery,
				detail: { tags: ['UNO'] },
			},
			({ params, query, set }) =>
				respond(set, () =>
					unoService.request(
						`/clans/${encodeURIComponent(params.clan_id)}/analytics`,
						query
					)
				)
		)
		.get(
			'/clans/:clan_id/vs/:opponent_id',
			{
				params: t.Object({
					clan_id: t.String({ format: 'uuid' }),
					opponent_id: t.String({ format: 'uuid' }),
				}),
				query: dateRangeQuery,
				detail: { tags: ['UNO'] },
			},
			({ params, query, set }) =>
				respond(set, () =>
					unoService.request(
						`/clans/${encodeURIComponent(params.clan_id)}/vs/${encodeURIComponent(params.opponent_id)}`,
						query
					)
				)
		)
		.get(
			'/clans/:clan_id/rating-history',
			{ params: clanParams, detail: { tags: ['UNO'] } },
			({ params, set }) =>
				respond(set, () =>
					unoService.request(
						`/clans/${encodeURIComponent(params.clan_id)}/rating-history`
					)
				)
		)
		.get(
			'/calendar',
			{ query: dateRangeQuery, detail: { tags: ['UNO'] } },
			({ query, set }) =>
				respond(set, () => unoService.request('/calendar', query))
		)
		.get(
			'/grids',
			{ query: gridListQuery, detail: { tags: ['UNO'] } },
			({ query, set }) =>
				respond(set, () => unoService.request('/grids', query))
		)
		.get(
			'/grids/:grid_id',
			{
				params: gridParams,
				query: t.Object({
					q: t.Optional(t.String()),
					rank: t.Optional(RANK),
					timezone: t.Optional(t.String()),
				}),
				detail: { tags: ['UNO'] },
			},
			({ params, query, set }) =>
				respond(set, async () => {
					const gridId = encodeURIComponent(params.grid_id)
					const [detail, exported] = await Promise.all([
						unoService.request(`/grids/${gridId}`, {
							q: query.q,
							rank: query.rank,
						}),
						unoService.request(`/grids/${gridId}/export`),
					])
					return compactGridEvent(detail, exported, query.timezone)
				})
		)
		.get(
			'/grids/:grid_id/groups/:number',
			{
				params: t.Object({
					grid_id: t.String({ format: 'uuid' }),
					number: t.Numeric({ minimum: 0 }),
				}),
				detail: { tags: ['UNO'] },
			},
			({ params, set }) =>
				respond(set, () =>
					unoService.request(
						`/grids/${encodeURIComponent(params.grid_id)}/groups/${params.number}`
					)
				)
		)
		.get(
			'/grids/:grid_id/export',
			{ params: gridParams, detail: { tags: ['UNO'] } },
			({ params, set }) =>
				respond(set, () =>
					unoService.request(
						`/grids/${encodeURIComponent(params.grid_id)}/export`
					)
				)
		)
		.get(
			'/coverage',
			{ query: dateRangeQuery, detail: { tags: ['UNO'] } },
			({ query, set }) =>
				respond(set, () => unoService.request('/coverage', query))
		)
		.get('/seasons', { detail: { tags: ['UNO'] } }, ({ set }) =>
			respond(set, () => unoService.request('/seasons'))
		)
		.get('/rules', { detail: { tags: ['UNO'] } }, ({ set }) =>
			respond(set, () => unoService.request('/rules'))
		)
)
