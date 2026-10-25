import { t } from 'elysia'
import type { BuildData } from '@/types/build.type'
import {
	checkPermission,
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { enforceContentSpam, SPAM_LIMIT_BUILD } from '@/utils/auto-ban'
import { validateBuildData } from '@/utils/build.validation'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { rejectOnXss } from '@/utils/xss-guard'
import { buildsService } from './builds.service'

export const buildsRoutes = createElysia().group('/builds', (app) =>
	app
		.use(jwtPlugin)

		.get(
			'',
			{
				beforeHandle: [requireOptionalAuth],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					tags: t.Optional(t.String()),
					sort: t.Optional(
						t.Union([
							t.Literal('newest'),
							t.Literal('stars'),
							t.Literal('price'),
							t.Literal('armor'),
							t.Literal('container'),
							t.Literal('quality'),
						])
					),
					price_min: t.Optional(t.Numeric()),
					price_max: t.Optional(t.Numeric()),
					armor: t.Optional(t.String()),
					container: t.Optional(t.String()),
					art: t.Optional(t.String()),
					quality_min: t.Optional(t.Numeric()),
					quality_max: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Builds'] },
			},
			async ({ query, store }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				const tags = query.tags
					? query.tags
							.split(',')
							.map((t) => t.trim())
							.filter(Boolean)
					: undefined
				const splitItemIds = (raw: string | undefined) =>
					raw
						? raw
								.split(',')
								.map((t) => t.trim())
								.filter(Boolean)
						: undefined
				return buildsService.list(take, page, {
					tags,
					sort: query.sort ?? 'newest',
					price_min: query.price_min,
					price_max: query.price_max,
					armor_ids: splitItemIds(query.armor),
					container_ids: splitItemIds(query.container),
					art_ids: splitItemIds(query.art),
					quality_min: query.quality_min,
					quality_max: query.quality_max,
					user_id: fromStoreOpt(store).user_id,
				})
			}
		)

		.get(
			'/:id',
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Builds'] },
			},
			async ({ params, store }) => {
				return buildsService.getById(
					params.id,
					fromStoreOpt(store).user_id
				)
			}
		)

		.post(
			'',
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					title: t.String({
						maxLength: 200,
					}),
					data: t.Any(),
					flags: t.Optional(t.Numeric()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Builds'] },
			},
			async ({ body, store, set, request }) => {
				const validation = validateBuildData(body.data)
				if (!validation.ok) {
					set.status = 422
					return { error: validation.error }
				}

				const user_id = fromStore(store).user_id
				const xss = await rejectOnXss({
					fields: {
						title: body.title,
						tags: body.tags?.join(' '),
					},
					user_id,
					ip:
						request.headers
							.get('x-forwarded-for')
							?.split(',')[0]
							?.trim() ??
						request.headers.get('x-real-ip') ??
						'?',
					route: 'POST /builds',
				})
				if (xss) {
					set.status = 400
					return { error: `Invalid content in field: ${xss.field}` }
				}
				await enforceContentSpam(user_id, SPAM_LIMIT_BUILD)

				return buildsService.create(user_id, {
					title: body.title,
					data: validation.data,
					flags: body.flags,
					tags: body.tags?.join(','),
				})
			}
		)

		.patch(
			'/:id',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					title: t.Optional(t.String({ maxLength: 200 })),
					data: t.Optional(t.Any()),
					flags: t.Optional(t.Numeric()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Builds'] },
			},
			async ({ params, body, store, set, request }) => {
				const { user_id } = fromStore(store)
				if (body.title !== undefined || body.tags !== undefined) {
					const xssPatch = await rejectOnXss({
						fields: {
							title: body.title,
							tags: body.tags?.join(' '),
						},
						user_id,
						ip:
							request.headers
								.get('x-forwarded-for')
								?.split(',')[0]
								?.trim() ??
							request.headers.get('x-real-ip') ??
							'?',
						route: 'PATCH /builds/:id',
					})
					if (xssPatch) {
						set.status = 400
						return {
							error: `Invalid content in field: ${xssPatch.field}`,
						}
					}
				}
				const is_admin = await checkPermission(user_id, 'builds:manage')

				let validatedData: BuildData | undefined
				if (body.data !== undefined) {
					const validation = validateBuildData(body.data)
					if (!validation.ok) {
						set.status = 422
						return { error: validation.error }
					}
					validatedData = validation.data
				}

				const result = await buildsService.update(
					Number(params.id),
					user_id,
					is_admin,
					{
						...(body.title !== undefined && { title: body.title }),
						...(validatedData !== undefined && {
							data: validatedData,
						}),
						...(body.flags !== undefined && { flags: body.flags }),
						...(body.tags !== undefined && {
							tags: body.tags.join(','),
						}),
					}
				)

				if (!result) {
					set.status = 404
					return { error: 'Not found' }
				}
				if ('error' in result) {
					set.status = 403
					return result
				}

				return result
			}
		)

		.delete(
			'/:id',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Builds'] },
			},
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(user_id, 'builds:manage')
				const ok = await buildsService.delete(
					Number(params.id),
					user_id,
					is_admin
				)

				if (!ok) {
					set.status = 403
					return { error: 'Forbidden' }
				}

				return { success: true }
			}
		)

		.post(
			'/:id/star',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Builds'] },
			},
			async ({ params, store }) => {
				await buildsService.addStar(
					Number(params.id),
					fromStore(store).user_id
				)
				return { success: true }
			}
		)

		.delete(
			'/:id/star',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Builds'] },
			},
			async ({ params, store }) => {
				await buildsService.removeStar(
					Number(params.id),
					fromStore(store).user_id
				)
				return { success: true }
			}
		)
)
