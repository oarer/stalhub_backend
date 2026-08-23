import { t } from 'elysia'
import { ArticleStatus, ArticleType } from 'generated/prisma/client'
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
import { commentsRoutes } from './comments'

export const articlesRoutes = createElysia().group('/articles', (app) =>
	app
		.use(jwtPlugin)

		.get(
			'',
			async ({ query, store }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(user_id, 'articles:manage')
				return articlesService.list(take, page, {
					all: is_admin,
					...(!is_admin && { author_id: user_id }),
				})
			},
			{
				beforeHandle: [requireAuth],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.get(
			'/public',
			async ({ query }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
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
					fromStoreOpt(store).user_id
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
			async ({ body, store, set }) => {
				if (body.type === ArticleType.STALHUB) {
					const is_admin = await checkPermission(
						fromStore(store).user_id,
						'articles:manage'
					)
					if (!is_admin) {
						set.status = 403
						return {
							error: 'Only admins can create STALHUB articles',
						}
					}
				}

				return articlesService.create(fromStore(store).user_id, {
					title: body.title,
					content: body.content,
					type: body.type,
					rewards: body.rewards,
					flags: body.flags,
					tags: body.tags?.join(','),
					image_url: body.image_url,
				})
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					title: t.String({
						error: 'title is required',
						maxLength: 200,
					}),
					content: t.String({
						error: 'content is required',
						maxLength: 50000,
					}),
					type: t.Optional(t.Enum(ArticleType)),
					image_url: t.Optional(t.String()),
					rewards: t.Optional(
						t.Object({
							money: t.Numeric(),
							items: t.Array(t.String()),
						})
					),
					flags: t.Optional(t.Numeric()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(user_id, 'articles:manage')
				const result = await articlesService.update(
					Number(params.id),
					user_id,
					is_admin,
					{
						...(body.title !== undefined && { title: body.title }),
						...(body.content !== undefined && {
							content: body.content,
						}),
						...(body.type !== undefined && { type: body.type }),
						...(body.rewards !== undefined && {
							rewards: body.rewards,
						}),
						...(body.flags !== undefined && { flags: body.flags }),
						...(body.tags !== undefined && {
							tags: body.tags.join(','),
						}),
						...(body.image_url !== undefined && {
							image_url: body.image_url,
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
					title: t.Optional(t.String({ maxLength: 200 })),
					content: t.Optional(t.String({ maxLength: 50000 })),
					type: t.Optional(t.Enum(ArticleType)),
					image_url: t.Optional(t.Nullable(t.String())),
					rewards: t.Optional(
						t.Object({
							money: t.Numeric(),
							items: t.Array(t.String()),
						})
					),
					flags: t.Optional(t.Numeric()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.delete(
			'/:id',
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(user_id, 'articles:manage')
				const ok = await articlesService.delete(
					Number(params.id),
					user_id,
					is_admin
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

		.patch(
			'/:id/status',
			async ({ params, body, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(user_id, 'articles:manage')
				if (!is_admin) {
					set.status = 403
					return { error: 'Forbidden' }
				}

				const result = await articlesService.setStatus(
					Number(params.id),
					body.status,
					body.reason
				)

				if (!result) {
					set.status = 404
					return { error: 'Not found' }
				}

				return result
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					status: t.Enum(ArticleStatus),
					reason: t.Optional(t.String()),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.post(
			'/:id/submit',
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const result = await articlesService.submitForReview(
					Number(params.id),
					user_id
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
			'/:id/versions/:version_id',
			async ({ params, set }) => {
				const version = await articlesService.getVersion(
					Number(params.version_id)
				)
				if (!version) {
					set.status = 404
					return { error: 'Version not found' }
				}
				return version
			},
			{
				params: t.Object({ id: t.String(), version_id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.post(
			'/:id/star',
			async ({ params, store }) => {
				await articlesService.addStar(
					Number(params.id),
					fromStore(store).user_id
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
					fromStore(store).user_id
				)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.use(commentsRoutes)
)
