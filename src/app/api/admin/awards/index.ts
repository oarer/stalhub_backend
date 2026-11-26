import { t } from 'elysia'
import { requireAuth, requirePermission } from '@/utils/auth.guard'
import { resolveAwardsActor } from '@/utils/awards-identity'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import * as service from './awards.service'

const campaignParams = t.Object({ campaignId: t.String() })

const categoryParams = t.Object({
	campaignId: t.String(),
	categoryId: t.String(),
})

const nomineeParams = t.Object({
	campaignId: t.String(),
	categoryId: t.String(),
	nomineeId: t.String(),
})

const campaignBody = t.Object({
	year: t.Integer(),
	title: t.Optional(t.String()),
	ends_at: t.Optional(t.String()),
})

const patchBody = t.Object({
	title: t.Optional(t.String()),
	ends_at: t.Optional(t.Union([t.String(), t.Null()])),
	status: t.Optional(t.String()),
})

const categoryBody = t.Object({
	slug: t.Optional(t.String()),
	title_i18n: t.Unknown(),
	description_i18n: t.Optional(t.Unknown()),
	kind: t.Optional(
		t.Union([
			t.Literal('NOMINEES'),
			t.Literal('UPDATES'),
			t.Literal('CLAN'),
			t.Literal('PLAYER'),
		])
	),
	position: t.Optional(t.Integer()),
	image_url: t.Optional(t.Union([t.String(), t.Null()])),
})

const nomineeBody = t.Object({
	name: t.Optional(t.String()),
	description_i18n: t.Optional(t.Unknown()),
	date: t.Optional(t.Union([t.String(), t.Null()])),
	patch_url: t.Optional(t.Union([t.String(), t.Null()])),
	avatar_url: t.Optional(t.Union([t.String(), t.Null()])),
	social_links: t.Optional(
		t.Array(t.Object({ label: t.String(), url: t.String() }), {
			maxItems: 10,
		})
	),
})

const placeBody = t.Object({ manual_place: t.Union([t.Integer(), t.Null()]) })

const placesBody = t.Object({
	places: t.Array(
		t.Object({
			category_id: t.String(),
			nominee_id: t.String(),
			manual_place: t.Union([t.Integer(), t.Null()]),
		}),
		{ maxItems: 1000 }
	),
})

const avatarBody = t.Object({
	file: t.File({ maxSize: '10m' }),
	previous_url: t.Optional(t.String()),
})

const votePatchBody = t.Object({
	excluded: t.Boolean(),
	reason: t.Optional(t.String()),
})

const votesQuery = t.Object({
	category_id: t.Optional(t.String()),
	nominee_id: t.Optional(t.String()),
	user_id: t.Optional(t.Numeric()),
	excluded: t.Optional(t.Boolean()),
	from: t.Optional(t.String()),
	to: t.Optional(t.String()),
	cursor: t.Optional(t.String()),
	take: t.Optional(t.Numeric()),
})

async function respond(
	set: { status?: number | string },
	action: () => Promise<unknown>
) {
	try {
		return await action()
	} catch (error) {
		if (error && typeof error === 'object' && 'status' in error) {
			const e = error as {
				status: number
				code?: string
				locales?: string[]
				publish_block_reason?: string
				categories?: unknown[]
			}
			set.status = e.status
			return {
				error: e.code ?? 'error',
				code: e.code,
				locales: e.locales,
				publish_block_reason: e.publish_block_reason,
				categories: e.categories,
			}
		}
		set.status = 500
		return { error: 'awards_admin_error' }
	}
}
const guard = [requireAuth, requirePermission('awards:manage')]

export const adminAwardsRoutes = createElysia().group('/awards', (app) =>
	app
		.use(jwtPlugin)
		.get('', { beforeHandle: guard }, ({ set }) =>
			respond(set, service.list)
		)
		.get(
			'/:campaignId/categories',
			{ beforeHandle: guard, params: campaignParams },
			({ params, set }) =>
				respond(set, () => service.categories(params.campaignId))
		)
		.get(
			'/:campaignId/categories/:categoryId/nominees',
			{ beforeHandle: guard, params: categoryParams },
			({ params, set }) =>
				respond(set, async () =>
					service.nominees(params.campaignId, params.categoryId)
				)
		)
		.post(
			'',
			{ beforeHandle: guard, body: campaignBody },
			({ body, set }) => respond(set, () => service.createCampaign(body))
		)
		.patch(
			'/:id',
			{
				beforeHandle: guard,
				params: t.Object({ id: t.String() }),
				body: patchBody,
			},
			async ({ params, body, cookie, jwt, set }) =>
				respond(set, async () =>
					service.patchCampaign(
						params.id,
						body,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.post(
			'/:campaignId/categories',
			{ beforeHandle: guard, params: campaignParams, body: categoryBody },
			async ({ params, body, cookie, jwt, set }) =>
				respond(set, async () =>
					service.createCategory(
						params.campaignId,
						body,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.delete(
			'/:campaignId/categories/:categoryId',
			{ beforeHandle: guard, params: categoryParams },
			async ({ params, cookie, jwt, set }) =>
				respond(set, async () =>
					service.deleteCategory(
						params.campaignId,
						params.categoryId,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.post(
			'/:campaignId/categories/:categoryId/nominees',
			{ beforeHandle: guard, params: categoryParams, body: nomineeBody },
			async ({ params, body, cookie, jwt, set }) =>
				respond(set, async () =>
					service.createNominee(
						params.campaignId,
						params.categoryId,
						body,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.delete(
			'/:campaignId/categories/:categoryId/nominees/:nomineeId',
			{ beforeHandle: guard, params: nomineeParams },
			async ({ params, cookie, jwt, set }) =>
				respond(set, async () =>
					service.deleteNominee(
						params.campaignId,
						params.categoryId,
						params.nomineeId,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.patch(
			'/:campaignId/categories/:categoryId',
			{ beforeHandle: guard, params: categoryParams, body: categoryBody },
			async ({ params, body, cookie, jwt, set }) =>
				respond(set, async () =>
					service.patchCategory(
						params.campaignId,
						params.categoryId,
						body,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.patch(
			'/:campaignId/categories/:categoryId/nominees/:nomineeId',
			{ beforeHandle: guard, params: nomineeParams, body: nomineeBody },
			async ({ params, body, cookie, jwt, set }) =>
				respond(set, async () =>
					service.patchNominee(
						params.campaignId,
						params.categoryId,
						params.nomineeId,
						body,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.patch(
			'/:campaignId/categories/:categoryId/nominees/:nomineeId/place',
			{ beforeHandle: guard, params: nomineeParams, body: placeBody },
			async ({ params, body, cookie, jwt, set }) =>
				respond(set, async () =>
					service.setPlace(
						params.campaignId,
						params.categoryId,
						params.nomineeId,
						body.manual_place,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.patch(
			'/:campaignId/places',
			{
				beforeHandle: guard,
				params: campaignParams,
				body: placesBody,
			},
			async ({ params, body, cookie, jwt, set }) =>
				respond(set, async () =>
					service.setPlaces(
						params.campaignId,
						body.places,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.get(
			'/:id/votes',
			{
				beforeHandle: guard,
				params: t.Object({ id: t.String() }),
				query: votesQuery,
			},
			({ params, query, set }) =>
				respond(set, () => service.votes(params.id, query))
		)
		.patch(
			'/:id/votes/:voteId',
			{
				beforeHandle: guard,
				params: t.Object({ id: t.String(), voteId: t.String() }),
				body: votePatchBody,
			},
			async ({ params, body, cookie, jwt, set }) =>
				respond(set, async () =>
					service.excludeVote(
						params.id,
						params.voteId,
						body.excluded,
						body.reason,
						await resolveAwardsActor({ cookie, jwt })
					)
				)
		)
		.post(
			'/nominees/avatar',
			{ beforeHandle: guard, body: avatarBody },
			async ({ body, set }) => {
				try {
					const file = Buffer.from(await body.file.arrayBuffer())
					return await service.avatar(file, body.previous_url)
				} catch (error) {
					if (
						error &&
						typeof error === 'object' &&
						'status' in error
					) {
						const e = error as { status: number; code?: string }
						set.status = e.status
						return { error: e.code ?? 'error', code: e.code }
					}
					set.status = 500
					return { error: 'avatar_error' }
				}
			}
		)
		.post(
			'/categories/image',
			{ beforeHandle: guard, body: avatarBody },
			async ({ body, set }) => {
				try {
					const file = Buffer.from(await body.file.arrayBuffer())
					return await service.categoryImage(file, body.previous_url)
				} catch (error) {
					if (
						error &&
						typeof error === 'object' &&
						'status' in error
					) {
						const e = error as { status: number; code?: string }
						set.status = e.status
						return { error: e.code ?? 'error', code: e.code }
					}
					set.status = 500
					return { error: 'image_error' }
				}
			}
		)
		.get(
			'/:id/stats',
			{ beforeHandle: guard, params: t.Object({ id: t.String() }) },
			({ params, set }) => respond(set, () => service.stats(params.id))
		)
		.get(
			'/:id/results',
			{ beforeHandle: guard, params: t.Object({ id: t.String() }) },
			({ params, set }) => respond(set, () => service.results(params.id))
		)
)
