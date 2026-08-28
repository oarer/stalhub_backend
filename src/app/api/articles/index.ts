import { t } from 'elysia'
import { ArticleStatus, ArticleType, QuestType } from 'generated/prisma/client'
import {
	checkPermission,
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import {
	ARTICLE_IMAGE_MAX_BYTES,
	normalizeQuestMap,
	saveArticleImage,
} from './article-media'
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
				const is_admin = await checkPermission(
					user_id,
					'articles:manage'
				)
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
			'/mine',
			({ query, store }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				return articlesService.list(take, page, {
					author_id: fromStore(store).user_id,
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
			async ({ params, store, request }) => {
				return articlesService.getById(
					params.id,
					fromStoreOpt(store).user_id,
					{
						ip:
							request.headers
								.get('x-forwarded-for')
								?.split(',')[0]
								?.trim() ??
							request.headers.get('x-real-ip') ??
							undefined,
						userAgent:
							request.headers.get('user-agent') ?? undefined,
					}
				)
			},
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.post(
			'/:id/image',
			async ({ params, body, store, set }) => {
				const userId = fromStore(store).user_id
				const isAdmin = await checkPermission(userId, 'articles:manage')
				const article = await articlesService.getOwned(
					Number(params.id),
					userId,
					isAdmin
				)
				if (!article) {
					set.status = 403
					return { error: 'Forbidden' }
				}
				try {
					return {
						url: await saveArticleImage(article.id, body.file),
					}
				} catch (error) {
					set.status = 400
					return { error: (error as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					file: t.File({
						type: [
							'image/jpeg',
							'image/png',
							'image/webp',
							'image/gif',
						],
						maxSize: ARTICLE_IMAGE_MAX_BYTES,
					}),
				}),
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
					flags: body.flags,
					tags: body.tags?.join(','),
					image_url: body.image_url,
					quest_name: body.quest_name,
					quest_type: body.quest_type,
					quest_map: normalizeQuestMap(body.quest_map),
					reward_text: body.reward_text,
					reward_money: body.reward_money,
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
					quest_name: t.Optional(
						t.Nullable(t.String({ maxLength: 200 }))
					),
					quest_type: t.Optional(t.Nullable(t.Enum(QuestType))),
					quest_map: t.Optional(t.Nullable(t.Unknown())),
					reward_text: t.Optional(
						t.Nullable(t.String({ maxLength: 5000 }))
					),
					reward_money: t.Optional(
						t.Nullable(t.Integer({ minimum: 0 }))
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
				const is_admin = await checkPermission(
					user_id,
					'articles:manage'
				)
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
						...(body.flags !== undefined && { flags: body.flags }),
						...(body.tags !== undefined && {
							tags: body.tags.join(','),
						}),
						...(body.image_url !== undefined && {
							image_url: body.image_url,
						}),
						...(body.quest_name !== undefined && {
							quest_name: body.quest_name,
						}),
						...(body.quest_type !== undefined && {
							quest_type: body.quest_type,
						}),
						...(body.quest_map !== undefined && {
							quest_map: normalizeQuestMap(body.quest_map),
						}),
						...(body.reward_text !== undefined && {
							reward_text: body.reward_text,
						}),
						...(body.reward_money !== undefined && {
							reward_money: body.reward_money,
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
					quest_name: t.Optional(
						t.Nullable(t.String({ maxLength: 200 }))
					),
					quest_type: t.Optional(t.Nullable(t.Enum(QuestType))),
					quest_map: t.Optional(t.Nullable(t.Unknown())),
					reward_text: t.Optional(
						t.Nullable(t.String({ maxLength: 5000 }))
					),
					reward_money: t.Optional(
						t.Nullable(t.Integer({ minimum: 0 }))
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
				const is_admin = await checkPermission(
					user_id,
					'articles:manage'
				)
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
				const is_admin = await checkPermission(
					user_id,
					'articles:manage'
				)
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
