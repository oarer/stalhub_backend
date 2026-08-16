import { t } from 'elysia'
import { ArtType } from 'generated/prisma/client'
import {
	type AuthContext,
	checkPermission,
	checkRole,
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { artsService } from './arts.service'
import { artCommentsRoutes } from './comments'

async function requireArtAuthor({ store, set }: AuthContext) {
	const userId = store.authUserId as number
	const isAuthor = await checkRole(userId, 'art:author')
	const isAdmin = await checkPermission(userId, 'art:manage')
	if (!isAuthor && !isAdmin) {
		set.status = 403
		return { error: 'Forbidden' }
	}
}

export const artsRoutes = createElysia().group('/arts', (app) =>
	app
		.use(jwtPlugin)

		.get(
			'',
			async ({ query, store }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				const { userId } = fromStore(store)
				const isAdmin = await checkPermission(userId, 'art:manage')
				return artsService.list(take, page, {
					...(!isAdmin && { authorId: userId }),
				})
			},
			{
				beforeHandle: [requireAuth, requireArtAuthor],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Arts'] },
			}
		)

		.get(
			'/public',
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
				})
			},
			{
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					tags: t.Optional(t.String()),
					type: t.Optional(t.Enum(ArtType)),
				}),
				detail: { tags: ['Arts'] },
			}
		)

		.get(
			'/:id',
			async ({ params, store }) => {
				return artsService.getById(
					params.id,
					fromStoreOpt(store).userId
				)
			},
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Arts'] },
			}
		)

		.post(
			'/upload',
			async ({ body, set }) => {
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())

				try {
					return await artsService.saveArtImage({
						name: file.name,
						type: file.type,
						buffer: buf,
					})
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth, requireArtAuthor],
				body: t.Object({
					file: t.File({
						type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
					}),
				}),
				detail: { tags: ['Arts'] },
			}
		)

		.post(
			'',
			async ({ body, store }) => {
				return artsService.create(fromStore(store).userId, {
					title: body.title,
					type: body.type,
					image_url: body.image_url,
					tags: body.tags?.join(','),
				})
			},
			{
				beforeHandle: [requireAuth, requireArtAuthor],
				body: t.Object({
					title: t.String({
						error: 'title is required',
						maxLength: 200,
					}),
					type: t.Optional(t.Enum(ArtType)),
					image_url: t.Optional(t.String()),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Arts'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body, store, set }) => {
				const { userId } = fromStore(store)
				const isAdmin = await checkPermission(userId, 'art:manage')
				const result = await artsService.update(
					Number(params.id),
					userId,
					isAdmin,
					{
						...(body.title !== undefined && { title: body.title }),
						...(body.type !== undefined && { type: body.type }),
						...(body.image_url !== undefined && {
							image_url: body.image_url,
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
					title: t.Optional(t.String({ maxLength: 200 })),
					type: t.Optional(t.Enum(ArtType)),
					image_url: t.Optional(t.Nullable(t.String())),
					tags: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Arts'] },
			}
		)

		.delete(
			'/:id',
			async ({ params, store, set }) => {
				const { userId } = fromStore(store)
				const isAdmin = await checkPermission(userId, 'art:manage')
				const ok = await artsService.delete(
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
				detail: { tags: ['Arts'] },
			}
		)

		.post(
			'/:id/star',
			async ({ params, store }) => {
				await artsService.addStar(
					Number(params.id),
					fromStore(store).userId
				)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Arts'] },
			}
		)

		.delete(
			'/:id/star',
			async ({ params, store }) => {
				await artsService.removeStar(
					Number(params.id),
					fromStore(store).userId
				)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Arts'] },
			}
		)

		.use(artCommentsRoutes)
)
