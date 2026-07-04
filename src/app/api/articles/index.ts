import { t } from 'elysia'
import {
	checkPermission,
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { articlesService } from './articles.service'

export const articlesRoutes = createElysia().group('/articles', (app) =>
	app
		.use(jwtPlugin)

		.get(
			'',
			async ({ query }) => {
				const take = query.take ?? 24
				const page = query.page ?? 0
				return articlesService.list(take, page)
			},
			{
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.get(
			'/:id',
			async ({ params, store }) => {
				return articlesService.getById(
					params.id,
					fromStoreOpt(store).userId
				)
			},
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.post(
			'',
			async ({ body, store }) => {
				return articlesService.create(fromStore(store).userId, {
					title: body.title,
					content: body.content,
					flags: body.flags,
					accent_color: body.accent_color,
					tags: body.tags?.join(','),
				})
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					title: t.String({ error: 'title is required' }),
					content: t.String({ error: 'content is required' }),
					flags: t.Optional(t.Numeric()),
					accent_color: t.Optional(t.String()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body, store, set }) => {
				const { userId } = fromStore(store)
				const isAdmin = await checkPermission(userId, 'articles:manage')
				const result = await articlesService.update(
					Number(params.id),
					userId,
					isAdmin,
					{
						...(body.title !== undefined && { title: body.title }),
						...(body.content !== undefined && {
							content: body.content,
						}),
						...(body.flags !== undefined && { flags: body.flags }),
						...(body.accent_color !== undefined && {
							accent_color: body.accent_color,
						}),
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
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					title: t.Optional(t.String()),
					content: t.Optional(t.String()),
					flags: t.Optional(t.Numeric()),
					accent_color: t.Optional(t.String()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.delete(
			'/:id',
			async ({ params, store, set }) => {
				const { userId } = fromStore(store)
				const isAdmin = await checkPermission(userId, 'articles:manage')
				const ok = await articlesService.delete(
					Number(params.id),
					userId,
					isAdmin
				)

				if (!ok) {
					set.status = 403
					return { error: 'Forbidden' }
				}

				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.get(
			'/:id/versions',
			async ({ params, set }) => {
				const versions = await articlesService.getVersions(
					Number(params.id)
				)
				if (!versions.length) {
					set.status = 404
					return { error: 'Article not found' }
				}
				return versions
			},
			{
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.get(
			'/:id/versions/:versionId',
			async ({ params, set }) => {
				const version = await articlesService.getVersion(
					Number(params.versionId)
				)
				if (!version) {
					set.status = 404
					return { error: 'Version not found' }
				}
				return version
			},
			{
				params: t.Object({ id: t.String(), versionId: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.post(
			'/:id/star',
			async ({ params, store }) => {
				await articlesService.addStar(
					Number(params.id),
					fromStore(store).userId
				)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.delete(
			'/:id/star',
			async ({ params, store }) => {
				await articlesService.removeStar(
					Number(params.id),
					fromStore(store).userId
				)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)
)
