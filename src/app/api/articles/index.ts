import { t } from 'elysia'
import { ArticleStatus, ArticleType, QuestType } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
	checkPermission,
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { enforceContentSpam, SPAM_LIMIT_ARTICLE } from '@/utils/auto-ban'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { isSafeUrl, rejectOnXss } from '@/utils/xss-guard'
import {
	ARTICLE_IMAGE_MAX_BYTES,
	normalizeQuestMap,
	saveArticleImage,
} from './article-media'
import { articlesService } from './articles.service'
import { generateBlogDigest } from './blog-digest'
import { type BlogPublishTarget, publishBlogPost } from './blog-publish'
import { commentsRoutes } from './comments'

const coverConfigSchema = t.Optional(
	t.Nullable(
		t.Object({
			mode: t.Optional(
				t.Union([
					t.Literal('auto'),
					t.Literal('custom'),
					t.Literal('hidden'),
				])
			),
			preset: t.Optional(t.String({ maxLength: 32 })),
			icon: t.Optional(t.String({ maxLength: 64 })),
			panel: t.Optional(
				t.Object({
					title: t.Optional(t.String({ maxLength: 48 })),
					rows: t.Optional(
						t.Array(
							t.Object({
								label: t.String({ maxLength: 24 }),
								value: t.String({ maxLength: 16 }),
								fill: t.Number({ minimum: 0, maximum: 1 }),
								accent: t.Optional(t.Boolean()),
							}),
							{ maxItems: 2 }
						)
					),
				})
			),
		})
	)
)

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
					type: query.type as ArticleType | undefined,
					...(!is_admin && { author_id: user_id }),
				})
			},
			{
				beforeHandle: [requireAuth],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					type: t.Optional(t.Enum(ArticleType)),
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
					type: query.type as ArticleType | undefined,
				})
			},
			{
				beforeHandle: [requireAuth],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					type: t.Optional(t.Enum(ArticleType)),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.get(
			'/public',
			async ({ query }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				return articlesService.list(take, page, {
					type: query.type as ArticleType | undefined,
				})
			},
			{
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					type: t.Optional(t.Enum(ArticleType)),
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
			async ({ body, store, set, request }) => {
				let is_stalhub_admin = false
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
					is_stalhub_admin = true
				}

				const user_id = fromStore(store).user_id

				const xss = await rejectOnXss({
					fields: {
						title: body.title,
						content: body.content,
						image_url: body.image_url,
						quest_name: body.quest_name,
						reward_text: body.reward_text,
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
					route: 'POST /articles',
				})
				if (xss) {
					set.status = 400
					return { error: `Invalid content in field: ${xss.field}` }
				}
				if (body.image_url && !isSafeUrl(body.image_url)) {
					set.status = 400
					return { error: 'Invalid image_url' }
				}

				await enforceContentSpam(user_id, SPAM_LIMIT_ARTICLE)

				const created = await articlesService.create(user_id, {
					title: body.title,
					content: body.content,
					type: body.type,
					flags: body.flags,
					tags: body.tags?.join(','),
					image_url: body.image_url ?? undefined,
					cover_config: body.cover_config ?? undefined,
					quest_name: body.quest_name,
					quest_type: body.quest_type,
					quest_map: normalizeQuestMap(body.quest_map),
					reward_text: body.reward_text,
					reward_money: body.reward_money,
				})

				if (is_stalhub_admin) {
					const published = await articlesService.setStatus(
						created.id,
						ArticleStatus.APPROVED
					)
					return published ?? created
				}

				return created
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
					image_url: t.Optional(t.Nullable(t.String())),
					cover_config: coverConfigSchema,
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
			async ({ params, body, store, set, request }) => {
				const { user_id } = fromStore(store)
				const xssPatch = await rejectOnXss({
					fields: {
						title: body.title,
						content: body.content,
						image_url: body.image_url,
						quest_name: body.quest_name,
						reward_text: body.reward_text,
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
					route: 'PATCH /articles/:id',
				})
				if (xssPatch) {
					set.status = 400
					return {
						error: `Invalid content in field: ${xssPatch.field}`,
					}
				}
				if (
					body.image_url !== undefined &&
					body.image_url !== null &&
					!isSafeUrl(body.image_url)
				) {
					set.status = 400
					return { error: 'Invalid image_url' }
				}
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
						...(body.cover_config !== undefined && {
							cover_config: body.cover_config,
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
					cover_config: coverConfigSchema,
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

		.post(
			'/:id/digest',
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(
					user_id,
					'articles:manage'
				)
				if (!is_admin) {
					set.status = 403
					return { error: 'Forbidden' }
				}
				const num = Number(params.id)
				const article = await prisma.article.findFirst({
					where: isNaN(num)
						? { external_id: params.id }
						: { OR: [{ external_id: params.id }, { id: num }] },
					select: { title: true, content: true, tags: true },
				})
				if (!article) {
					set.status = 404
					return { error: 'Not found' }
				}
				return generateBlogDigest({
					title: article.title,
					content: article.content,
					tags: article.tags
						? article.tags.split(',').filter(Boolean)
						: [],
				})
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Articles'] },
			}
		)

		.post(
			'/:id/publish',
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
				try {
					return await publishBlogPost(params.id, {
						digest: body.digest,
						targets: (body.targets ?? [
							'tg',
							'ds',
						]) as BlogPublishTarget[],
						withCover: body.with_cover ?? true,
					})
				} catch (err) {
					set.status = 404
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					digest: t.String({ minLength: 1, maxLength: 1500 }),
					targets: t.Optional(
						t.Array(t.Union([t.Literal('tg'), t.Literal('ds')]), {
							maxItems: 2,
						})
					),
					with_cover: t.Optional(t.Boolean()),
				}),
				detail: { tags: ['Articles'] },
			}
		)

		.use(commentsRoutes)
)
