import { t } from 'elysia'

import { createElysia } from '@/utils/elysia'
import { checkPermission, fromStore, fromStoreOpt, requireAuth, requireOptionalAuth } from '@/utils/auth.guard'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { buildsService } from './builds.service'

export const buildsRoutes = createElysia().group('/builds', (app) =>
	app
		.use(jwtPlugin)

		.get(
			'',
			async ({ query }) => {
				const take = query.take ?? 24
				const page = query.page ?? 0
				return buildsService.list(take, page)
			},
			{
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Builds'] },
			}
		)

		.get(
			'/:id',
			async ({ params, store }) => {
				return buildsService.getById(params.id, fromStoreOpt(store).userId)
			},
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Builds'] },
			}
		)

		.post(
			'',
			async ({ body, store }) => {
				return buildsService.create(fromStore(store).userId, {
					title: body.title,
					data: JSON.stringify(body.data),
					flags: body.flags,
					accent_color: body.accent_color,
					tags: body.tags?.join(','),
				})
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					title: t.String({ error: 'title is required' }),
					data: t.Any(),
					flags: t.Optional(t.Numeric()),
					accent_color: t.Optional(t.String()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Builds'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body, store, set }) => {
				const { userId } = fromStore(store)
				const isAdmin = await checkPermission(userId, 'builds:manage')
				const result = await buildsService.update(Number(params.id), userId, isAdmin, {
					...(body.title !== undefined && { title: body.title }),
					...(body.data !== undefined && { data: JSON.stringify(body.data) }),
					...(body.flags !== undefined && { flags: body.flags }),
					...(body.accent_color !== undefined && { accent_color: body.accent_color }),
					...(body.tags !== undefined && { tags: body.tags.join(',') }),
				})

				if (!result) {
					set.status = 404
					return { error: 'Not found' }
				}
				if ('error' in result) {
					set.status = 403
					return result
				}

				return result
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					title: t.Optional(t.String()),
					data: t.Optional(t.Any()),
					flags: t.Optional(t.Numeric()),
					accent_color: t.Optional(t.String()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Builds'] },
			}
		)

		.delete(
			'/:id',
			async ({ params, store, set }) => {
				const { userId } = fromStore(store)
				const isAdmin = await checkPermission(userId, 'builds:manage')
				const ok = await buildsService.delete(Number(params.id), userId, isAdmin)

				if (!ok) {
					set.status = 403
					return { error: 'Forbidden' }
				}

				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Builds'] },
			}
		)

		.post(
			'/:id/star',
			async ({ params, store }) => {
				await buildsService.addStar(Number(params.id), fromStore(store).userId)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Builds'] },
			}
		)

		.delete(
			'/:id/star',
			async ({ params, store }) => {
				await buildsService.removeStar(Number(params.id), fromStore(store).userId)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Builds'] },
			}
		)
)
