import { t } from 'elysia'
import {
	checkPermission,
	fromStore,
	requireAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { profileCommentsService } from '../services/comments'

export const profileCommentsRoutes = createElysia().group(
	'/id/:id/comments',
	(app) =>
		app
			.use(jwtPlugin)

			.get(
				'',
				async ({ params, query }) => {
					const take = query.take ?? 50
					const page = (query.page ?? 1) - 1
					return profileCommentsService.listByUser(
						Number(params.id),
						take,
						page
					)
				},
				{
					params: t.Object({ id: t.Numeric() }),
					query: t.Object({
						take: t.Optional(t.Numeric()),
						page: t.Optional(t.Numeric()),
					}),
					detail: { tags: ['User Profile Comments'] },
				}
			)

			.post(
				'',
				async ({ params, body, store }) => {
					const { user_id } = fromStore(store)
					const comment = await profileCommentsService.create(
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
					params: t.Object({ id: t.Numeric() }),
					body: t.Object({
						content: t.String({
							error: 'content is required',
							maxLength: 5000,
						}),
						parent_id: t.Optional(t.Number()),
					}),
					detail: { tags: ['User Profile Comments'] },
				}
			)

			.delete(
				'/:comment_id',
				async ({ params, store, set }) => {
					const { user_id } = fromStore(store)
					const is_admin = await checkPermission(
						user_id,
						'user:manage'
					)

					const ok = await profileCommentsService.delete(
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
						id: t.Numeric(),
						comment_id: t.Numeric(),
					}),
					detail: { tags: ['User Profile Comments'] },
				}
			)
)
