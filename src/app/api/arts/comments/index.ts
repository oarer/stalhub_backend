import { t } from 'elysia'
import { commentsService } from '@/app/api/articles/comments/comments.service'
import { checkPermission, fromStore, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'

export const artCommentsRoutes = createElysia().group('/:id/comments', (app) =>
	app
		.use(jwtPlugin)

		.get(
			'',
			async ({ params, query }) => {
				const take = query.take ?? 50
				const page = (query.page ?? 1) - 1
				return commentsService.listByArt(Number(params.id), take, page)
			},
			{
				params: t.Object({ id: t.String() }),
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Art Comments'] },
			}
		)

		.post(
			'',
			async ({ params, body, store }) => {
				const { user_id } = fromStore(store)
				const comment = await commentsService.createForArt(
					Number(params.id),
					user_id,
					{
						content: body.content,
						parent_id: body.parent_id,
					}
				)

				if (!comment) return { error: 'Parent comment not found' }

				return comment
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					content: t.String({
						error: 'content is required',
						maxLength: 5000,
					}),
					parent_id: t.Optional(t.Number()),
				}),
				detail: { tags: ['Art Comments'] },
			}
		)

		.delete(
			'/:comment_id',
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(user_id, 'art:manage')

				const ok = await commentsService.delete(
					Number(params.comment_id),
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
				params: t.Object({
					id: t.String(),
					comment_id: t.String(),
				}),
				detail: { tags: ['Art Comments'] },
			}
		)
)
