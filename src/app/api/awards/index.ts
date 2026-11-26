import { t } from 'elysia'
import { requireAuth, requireRole } from '@/utils/auth.guard'
import { resolveAwardsUserId } from '@/utils/awards-identity'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import {
	getAwards,
	getCategory,
	getResults,
	type Locale,
	nominate,
	playerTop,
	searchAwardPlayers,
	vote,
	voteForPlayer,
} from './awards.service'
import { ClanLookupError } from './clan-lookup.service'
import { PlayerLookupError } from './player-lookup.service'

const locale = t.Optional(
	t.Union([
		t.Literal('ru'),
		t.Literal('en'),
		t.Literal('es'),
		t.Literal('fr'),
		t.Literal('ko'),
	])
)
const body = t.Object({
	category_id: t.String({ minLength: 1 }),
	nominee_id: t.String({ minLength: 1 }),
})
const nominationBody = t.Object({
	category_id: t.String({ minLength: 1 }),
	clan_name: t.String({ minLength: 1, maxLength: 100 }),
})
const playerVoteBody = t.Object({
	category_id: t.String({ minLength: 1 }),
	player_name: t.String({ minLength: 1, maxLength: 64 }),
})
const playerSearchQuery = t.Object({
	category_id: t.String({ minLength: 1 }),
	q: t.String({ minLength: 2, maxLength: 64 }),
})
const playerTopQuery = t.Object({
	category_id: t.String({ minLength: 1 }),
	limit: t.Optional(t.Numeric({ minimum: 1, maximum: 20 })),
})

async function respond(
	set: { status?: number | string },
	action: () => Promise<unknown>
) {
	try {
		return await action()
	} catch (error) {
		if (
			error &&
			typeof error === 'object' &&
			'status' in error &&
			'code' in error
		) {
			const value = error as {
				status: number
				code: string
				extra?: Record<string, unknown>
			}
			set.status = value.status
			return { error: value.code, code: value.code, ...value.extra }
		}
		if (error instanceof ClanLookupError) {
			set.status = error.status
			return { error: error.code, code: error.code, ...error.extra }
		}
		if (error instanceof PlayerLookupError) {
			set.status = error.status
			return { error: error.code, code: error.code, ...error.extra }
		}
		console.error('[awards]', error)
		set.status = 500
		return { error: 'awards_error', code: 'awards_error' }
	}
}

async function exboStatus(userId: number) {
	const user = await import('@/lib/prisma').then(({ prisma }) =>
		prisma.user.findUnique({
			where: { id: userId },
			select: { exbo_auth: { select: { id: true } } },
		})
	)
	return Boolean(user?.exbo_auth)
}

export const awardsRoutes = createElysia().group('/awards', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			{
				beforeHandle: [requireAuth, requireRole('awards')],
				query: t.Object({ locale }),
			},
			({ query, cookie, jwt, set }) =>
				respond(set, async () => {
					const user_id = await resolveAwardsUserId({ cookie, jwt })
					const hasExbo = user_id
						? await exboStatus(user_id)
						: undefined
					return getAwards(
						(query.locale ?? 'ru') as Locale,
						user_id,
						hasExbo
					)
				})
		)
		.get(
			'/results',
			{
				beforeHandle: [requireAuth, requireRole('awards')],
				query: t.Object({ locale }),
			},
			({ query, set }) =>
				respond(set, () =>
					getResults((query.locale ?? 'ru') as Locale)
				)
		)
		.get(
			'/players/search',
			{
				beforeHandle: [requireAuth, requireRole('awards')],
				query: playerSearchQuery,
			},
			({ query, set }) =>
				respond(set, () =>
					searchAwardPlayers(query.category_id, query.q)
				)
		)
		.get(
			'/players/top',
			{
				beforeHandle: [requireAuth, requireRole('awards')],
				query: playerTopQuery,
			},
			({ query, set }) =>
				respond(set, () =>
					playerTop(
						query.category_id,
						query.limit ? Number(query.limit) : undefined
					)
				)
		)
		.get(
			'/:year/:slug',
			{
				beforeHandle: [requireAuth, requireRole('awards')],
				params: t.Object({ year: t.Numeric(), slug: t.String() }),
				query: t.Object({ locale }),
			},
			({ params, query, cookie, jwt, set }) =>
				respond(set, async () => {
					const user_id = await resolveAwardsUserId({ cookie, jwt })
					const hasExbo = user_id
						? await exboStatus(user_id)
						: undefined
					return getCategory(
						params.year,
						params.slug,
						(query.locale ?? 'ru') as Locale,
						user_id,
						hasExbo
					)
				})
		)
		.post(
			'/vote',
			{ beforeHandle: [requireAuth, requireRole('awards')], body },
			({ body: input, cookie, jwt, set }) =>
				respond(set, async () => {
					const user_id = await resolveAwardsUserId({
						cookie,
						jwt,
					})
					if (!user_id) {
						set.status = 401
						return {
							error: 'unauthorized',
							code: 'unauthorized',
						}
					}
					if (!(await exboStatus(user_id))) {
						set.status = 403
						return { error: 'not_exbo', code: 'not_exbo' }
					}
					await vote(user_id, input.category_id, input.nominee_id)
					set.status = 200
					return null
				})
		)
		.post(
			'/votes/player',
			{ beforeHandle: [requireAuth, requireRole('awards')], body: playerVoteBody },
			({ body: input, cookie, jwt, set }) =>
				respond(set, async () => {
					const user_id = await resolveAwardsUserId({ cookie, jwt })
					if (!user_id) {
						set.status = 401
						return { error: 'unauthorized', code: 'unauthorized' }
					}
					if (!(await exboStatus(user_id))) {
						set.status = 403
						return { error: 'not_exbo', code: 'not_exbo' }
					}
					const nominee = await voteForPlayer(
						user_id,
						input.category_id,
						input.player_name
					)
					set.status = 201
					return nominee
				})
		)
		.post(
			'/nominate',
			{ beforeHandle: [requireAuth, requireRole('awards')], body: nominationBody },
			({ body: input, cookie, jwt, set }) =>
				respond(set, async () => {
					const user_id = await resolveAwardsUserId({
						cookie,
						jwt,
					})
					if (!user_id) {
						set.status = 401
						return {
							error: 'unauthorized',
							code: 'unauthorized',
						}
					}
					if (!(await exboStatus(user_id))) {
						set.status = 403
						return { error: 'not_exbo', code: 'not_exbo' }
					}
					const result = await nominate(
						user_id,
						input.category_id,
						input.clan_name
					)
					set.status = 201
					return result
				})
		)
)
