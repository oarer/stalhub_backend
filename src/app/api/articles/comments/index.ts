import { t } from 'elysia'
import { checkPermission, fromStore, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { commentsService } from './comments.service'

export const commentsRoutes = createElysia().group(
	'/:id/comments',
	(app) =>
		app
			.use(jwtPlugin)

			.get(
				'',
				async ({ params, query }) => {
					const take = query.take ?? 50
					const page = (query.page ?? 1) - 1
					return commentsService.listByArticle(
						Number(params.id),
						take,
						page
					)
				},
				{
					params: t.Object({ id: t.String() }),
					query: t.Object({
						take: t.Optional(t.Numeric()),
						page: t.Optional(t.Numeric()),
					}),
					detail: { tags: ['Article Comments'] },
				}
			)

			.post(
				'',
				async ({ params, body, store }) => {
					const { userId } = fromStore(store)
					const comment = await commentsService.create(
						Number(params.id),
						userId,
						{
							content: body.content,
							parentId: body.parentId,
						}
					)

					if (!comment) return { error: 'Parent comment not found' }

					return comment
				},
				{
					beforeHandle: [requireAuth],
					params: t.Object({ id: t.String() }),
					body: t.Object({
						content: t.String({ error: 'content is required', maxLength: 5000 }),
						parentId: t.Optional(t.Number()),
					}),
					detail: { tags: ['Article Comments'] },
				}
			)

			.delete(
				'/:commentId',
				async ({ params, store, set }) => {
					const { userId } = fromStore(store)
					const isAdmin = await checkPermission(
						userId,
						'articles:manage'
					)

					const ok = await commentsService.delete(
						Number(params.commentId),
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
					params: t.Object({
						id: t.String(),
						commentId: t.String(),
					}),
					detail: { tags: ['Article Comments'] },
				}
			)
)
