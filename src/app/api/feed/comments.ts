import { t } from 'elysia'
import { commentsService } from '@/app/api/articles/comments/comments.service'
import { checkPermission, fromStore, requireAuth } from '@/utils/auth.guard'
import { enforceContentSpam, SPAM_LIMIT_COMMENT } from '@/utils/auto-ban'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { rejectOnXss } from '@/utils/xss-guard'

type CommentTarget = 'build' | 'tier_list' | 'post'

function commentRoutes(target: CommentTarget) {
	const routeName = target === 'tier_list' ? 'tier-lists' : `${target}s`
	return createElysia().group('/:id/comments', (app) =>
		app
			.use(jwtPlugin)
			.get(
				'',
				{
					params: t.Object({ id: t.String() }),
					query: t.Object({
						take: t.Optional(t.Numeric()),
						page: t.Optional(t.Numeric()),
					}),
				},
				async ({ params, query }) => {
					const take = query.take ?? 50
					const page = (query.page ?? 1) - 1
					if (target === 'build')
						return commentsService.listByBuild(
							params.id,
							take,
							page
						)
					if (target === 'tier_list')
						return commentsService.listByTierList(
							params.id,
							take,
							page
						)
					return commentsService.listByPost(params.id, take, page)
				}
			)
			.post(
				'',
				{
					beforeHandle: [requireAuth],
					params: t.Object({ id: t.String() }),
					body: t.Object({
						content: t.String({ maxLength: 5000 }),
						parent_id: t.Optional(t.Number()),
					}),
				},
				async ({ params, body, store, set, request }) => {
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
						route: `POST /${routeName}/:id/comments`,
					})
					if (xss) {
						set.status = 400
						return { error: 'Invalid content' }
					}
					await enforceContentSpam(user_id, SPAM_LIMIT_COMMENT)
					const data = {
						content: body.content,
						parent_id: body.parent_id,
					}
					const comment =
						target === 'build'
							? await commentsService.createForBuild(
									params.id,
									user_id,
									data
								)
							: target === 'tier_list'
								? await commentsService.createForTierList(
										params.id,
										user_id,
										data
									)
								: await commentsService.createForPost(
										params.id,
										user_id,
										data
									)
					if (!comment) return { error: 'Parent comment not found' }
					return comment
				}
			)
			.delete(
				'/:comment_id',
				{
					beforeHandle: [requireAuth],
					params: t.Object({
						id: t.String(),
						comment_id: t.String(),
					}),
				},
				async ({ params, store, set }) => {
					const { user_id } = fromStore(store)
					const is_admin = await checkPermission(
						user_id,
						target === 'build'
							? 'builds:manage'
							: target === 'tier_list'
								? 'tier_lists:manage'
								: 'user:manage'
					)
					const ok = await commentsService.delete(
						Number(params.comment_id),
						user_id,
						is_admin,
						target
					)
					if (!ok) {
						set.status = 403
						return { error: 'Forbidden' }
					}
					return { success: true }
				}
			)
	)
}

export const buildCommentsRoutes = commentRoutes('build')
export const tierListCommentsRoutes = commentRoutes('tier_list')
export const postCommentsRoutes = commentRoutes('post')
