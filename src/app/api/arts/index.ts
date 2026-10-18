import { t } from 'elysia'
import { ArtType } from 'generated/prisma/client'
import {
	type AuthContext,
	checkPermission,
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { enforceContentSpam, SPAM_LIMIT_ART } from '@/utils/auto-ban'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { isSafeUrl, rejectOnXss } from '@/utils/xss-guard'
import { artsService } from './arts.service'
import { artCommentsRoutes } from './comments'

async function requireArtAuthor({ store, set }: AuthContext) {
	const user_id = store.authUserId as number
	const isAuthor = await checkPermission(user_id, 'art:author')
	const is_admin = await checkPermission(user_id, 'art:manage')
	if (!isAuthor && !is_admin) {
		set.status = 403
		return { error: 'Forbidden' }
	}
}

export const artsRoutes = createElysia().group('/arts', (app) =>
	app
		.use(jwtPlugin)

		.get(
			'',
			{
				beforeHandle: [requireAuth, requireArtAuthor],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Arts'] },
			},
			async ({ query, store }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(user_id, 'art:manage')
				return artsService.list(take, page, {
					...(!is_admin && { author_id: user_id }),
				})
			}
		)

		.get(
			'/mine',
			{
				beforeHandle: [requireAuth, requireArtAuthor],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Arts'] },
			},
			({ query, store }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				return artsService.list(take, page, {
					author_id: fromStore(store).user_id,
				})
			}
		)

		.get(
			'/public',
			{
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					tags: t.Optional(t.String()),
					type: t.Optional(t.Enum(ArtType)),
					sort: t.Optional(
						t.Union([
							t.Literal('newest'),
							t.Literal('oldest'),
							t.Literal('views'),
							t.Literal('stars'),
						])
					),
				}),
				detail: { tags: ['Arts'] },
			},
			async ({ query }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				const tags = query.tags
					? query.tags
							.split(',')
							.map((t) => t.trim())
							.filter(Boolean)
					: undefined
				return artsService.list(take, page, {
					tags,
					type: query.type,
					sort: query.sort,
				})
			}
		)

		.get(
			'/:id',
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Arts'] },
			},
			async ({ params, store, request }) => {
				return artsService.getById(
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
			}
		)

		.post(
			'/upload',
			{
				beforeHandle: [requireAuth, requireArtAuthor],
				body: t.Object({
					file: t.File(),
				}),
				detail: { tags: ['Arts'] },
			},
			async ({ body, set }) => {
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())

				try {
					return await artsService.saveArtMedia({
						name: file.name,
						type: file.type,
						buffer: buf,
					})
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			}
		)

		.post(
			'',
			{
				beforeHandle: [requireAuth, requireArtAuthor],
				body: t.Object({
					title: t.Optional(t.String({ maxLength: 200 })),
					description: t.Optional(t.String({ maxLength: 2000 })),
					type: t.Optional(t.Enum(ArtType)),
					image_url: t.Optional(t.String()),
					image_urls: t.Optional(
						t.Array(t.String(), { maxItems: 10 })
					),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Arts'] },
			},
			async ({ body, store, set, request }) => {
				const user_id = fromStore(store).user_id
				const xss = await rejectOnXss({
					fields: {
						title: body.title,
						description: body.description,
						image_url: body.image_url,
						image_urls: body.image_urls?.join('\n'),
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
					route: 'POST /arts',
				})
				if (xss) {
					set.status = 400
					return { error: `Invalid content in field: ${xss.field}` }
				}
				for (const u of [
					body.image_url,
					...(body.image_urls ?? []),
				].filter(Boolean) as string[]) {
					if (!isSafeUrl(u)) {
						set.status = 400
						return { error: 'Invalid image URL' }
					}
				}
				await enforceContentSpam(user_id, SPAM_LIMIT_ART)

				if (body.image_urls && body.image_urls.length > 10) {
					set.status = 400
					return { error: 'Too many images (max 10)' }
				}

				return artsService.create(user_id, {
					title: body.title,
					description: body.description,
					type: body.type,
					image_url: body.image_url,
					image_urls: body.image_urls,
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
					title: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
					description: t.Optional(
						t.Nullable(t.String({ maxLength: 2000 }))
					),
					type: t.Optional(t.Enum(ArtType)),
					image_url: t.Optional(t.Nullable(t.String())),
					image_urls: t.Optional(
						t.Nullable(t.Array(t.String(), { maxItems: 10 }))
					),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Arts'] },
			},
			async ({ params, body, store, set, request }) => {
				const { user_id } = fromStore(store)
				const xssPatch = await rejectOnXss({
					fields: {
						title: body.title,
						description: body.description,
						image_url: body.image_url,
						image_urls: body.image_urls?.join('\n'),
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
					route: 'PATCH /arts/:id',
				})
				if (xssPatch) {
					set.status = 400
					return {
						error: `Invalid content in field: ${xssPatch.field}`,
					}
				}
				for (const u of [
					body.image_url,
					...(body.image_urls ?? []),
				].filter(Boolean) as string[]) {
					if (!isSafeUrl(u)) {
						set.status = 400
						return { error: 'Invalid image URL' }
					}
				}
				const is_admin = await checkPermission(user_id, 'art:manage')
				if (body.image_urls && body.image_urls.length > 10) {
					set.status = 400
					return { error: 'Too many images (max 10)' }
				}
				const result = await artsService.update(
					Number(params.id),
					user_id,
					is_admin,
					{
						...(body.title !== undefined && { title: body.title }),
						...(body.description !== undefined && {
							description: body.description,
						}),
						...(body.type !== undefined && { type: body.type }),
						...(body.image_url !== undefined && {
							image_url: body.image_url,
						}),
						...(body.image_urls !== undefined && {
							image_urls: body.image_urls,
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
			}
		)

		.delete(
			'/:id',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Arts'] },
			},
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(user_id, 'art:manage')
				const ok = await artsService.delete(
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
				detail: { tags: ['Arts'] },
			},
			async ({ params, store }) => {
				await artsService.addStar(
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
				detail: { tags: ['Arts'] },
			},
			async ({ params, store }) => {
				await artsService.removeStar(
					Number(params.id),
					fromStore(store).user_id
				)
				return { success: true }
			}
		)

		.use(artCommentsRoutes)
)
