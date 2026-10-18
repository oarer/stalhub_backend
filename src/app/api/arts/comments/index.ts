import { t } from 'elysia'
import { commentsService } from '@/app/api/articles/comments/comments.service'
import { checkPermission, fromStore, requireAuth } from '@/utils/auth.guard'
import { enforceContentSpam, SPAM_LIMIT_COMMENT } from '@/utils/auto-ban'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { rejectOnXss } from '@/utils/xss-guard'

export const artCommentsRoutes = createElysia().group('/:id/comments', (app) =>
	app
		.use(jwtPlugin)

		.get('', {
				params: t.Object({ id: t.String() }),
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Art Comments'] },
			}, async ({ params, query }) => {
				const take = query.take ?? 50
				const page = (query.page ?? 1) - 1
				return commentsService.listByArt(params.id, take, page)
			})

		.post('', {
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
			}, async ({ params, body, store, set, request }) => {
				const { user_id } = fromStore(store)
				const xss = await rejectOnXss({
					fields: { content: body.content },
					user_id,
					ip:
						request.headers
							.get('x-forwarded-for')
							?.split(',')[0]
							?.trim() ??
						request.headers.get('x-real-ip') ??
						'?',
					route: 'POST /arts/:id/comments',
				})
				if (xss) {
					set.status = 400
					return { error: 'Invalid content' }
				}
				await enforceContentSpam(user_id, SPAM_LIMIT_COMMENT)
				const comment = await commentsService.createForArt(
					params.id,
					user_id,
					{
						content: body.content,
						parent_id: body.parent_id,
					}
				)

				if (!comment) return { error: 'Parent comment not found' }

				return comment
			})

		.delete('/:comment_id', {
				beforeHandle: [requireAuth],
				params: t.Object({
					id: t.String(),
					comment_id: t.String(),
				}),
				detail: { tags: ['Art Comments'] },
			}, async ({ params, store, set }) => {
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
			})
)
