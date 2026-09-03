import { t } from 'elysia'
import { ArtType } from 'generated/prisma/client'
import {
	type AuthContext,
	checkPermission,
	requireAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { adminArtsService } from './arts.service'

async function requireArtManage({ store, set }: AuthContext) {
	const ok = await checkPermission(store.authUserId as number, 'art:manage')
	if (!ok) {
		set.status = 403
		return { error: 'Forbidden' }
	}
}

export const adminArtsRoutes = createElysia().group('/arts', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			async ({ query }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				const tags = query.tags
					? query.tags
							.split(',')
							.map((t) => t.trim())
							.filter(Boolean)
					: undefined
				return adminArtsService.list(
					take,
					page,
					query.search,
					query.type,
					tags
				)
			},
			{
				beforeHandle: [requireAuth, requireArtManage],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					search: t.Optional(t.String()),
					type: t.Optional(t.Enum(ArtType)),
					tags: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'',
			async ({ body, set }) => {
				try {
					return await adminArtsService.create({
						title: body.title,
						description: body.description,
						type: body.type,
						image_url: body.image_url,
						tags: body.tags?.join(','),
						author_id: body.author_id,
						author_name: body.author_name,
						author_social_links: body.author_social_links,
					})
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth, requireArtManage],
				body: t.Object({
					title: t.Optional(t.String({ maxLength: 200 })),
					description: t.Optional(t.String({ maxLength: 2000 })),
					type: t.Optional(t.Enum(ArtType)),
					image_url: t.Optional(t.String()),
					tags: t.Optional(t.Array(t.String())),
					author_id: t.Optional(t.Numeric()),
					author_name: t.Optional(t.String({ maxLength: 100 })),
					author_social_links: t.Optional(
						t.Record(t.String(), t.String())
					),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:id',
			async ({ params, set }) => {
				const result = await adminArtsService.get(Number(params.id))
				if (!result) {
					set.status = 404
					return { error: 'Art not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireArtManage],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body, set }) => {
				const result = await adminArtsService.update(
					Number(params.id),
					{
						...(body.title !== undefined && { title: body.title }),
						...(body.description !== undefined && { description: body.description }),
						...(body.type !== undefined && { type: body.type }),
						...(body.image_url !== undefined && {
							image_url: body.image_url,
						}),
						...(body.tags !== undefined && {
							tags: body.tags.join(','),
						}),
						...(body.author_id !== undefined && {
							author_id: body.author_id,
						}),
						...(body.author_name !== undefined && {
							author_name: body.author_name,
						}),
						...(body.author_social_links !== undefined && {
							author_social_links: body.author_social_links,
						}),
					}
				)
				if (!result) {
					set.status = 404
					return { error: 'Art not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireArtManage],
				params: t.Object({ id: t.Numeric() }),
				body: t.Object({
					title: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
					description: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
					type: t.Optional(t.Enum(ArtType)),
					image_url: t.Optional(t.Nullable(t.String())),
					tags: t.Optional(t.Array(t.String())),
					author_id: t.Optional(t.Nullable(t.Numeric())),
					author_name: t.Optional(t.Nullable(t.String())),
					author_social_links: t.Optional(
						t.Nullable(t.Record(t.String(), t.String()))
					),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:id',
			async ({ params, set }) => {
				const ok = await adminArtsService.remove(Number(params.id))
				if (!ok) {
					set.status = 404
					return { error: 'Art not found' }
				}
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireArtManage],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)
)
