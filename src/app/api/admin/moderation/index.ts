import { t } from 'elysia'
import { fromStore, requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { moderationService } from './moderation.service'

export const moderationRoutes = createElysia().group('/moderation', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'/articles',
			{
				beforeHandle: [requireAuth, requireAdmin],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					status: t.Optional(t.String()),
				}),
				detail: {
					tags: ['Admin'],
					summary: 'Article moderation queue',
				},
			},
			async ({ query }) =>
				moderationService.articleQueue({
					take: Math.min(Math.max(query.take ?? 24, 1), 100),
					page: Math.max((query.page ?? 1) - 1, 0),
					status: query.status,
				})
		)

		.get(
			'/auto-bans',
			{
				beforeHandle: [requireAuth, requireAdmin],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Admin'], summary: 'Auto-banned users list' },
			},
			async ({ query }) =>
				moderationService.autoBans({
					take: query.take ?? 24,
					page: Math.max((query.page ?? 1) - 1, 0),
				})
		)

		.post(
			'/auto-bans/clear',
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({ user_id: t.Numeric() }),
				detail: { tags: ['Admin'], summary: 'Clear auto-ban flag' },
			},
			async ({ body, store, set }) => {
				const result = await moderationService.clearAutoBan(
					fromStore(store).user_id,
					body.user_id
				)
				if (!result) {
					set.status = 404
					return { error: 'User not found' }
				}
				return result
			}
		)

		.get(
			'/multiaccounts',
			{
				beforeHandle: [requireAuth, requireAdmin],
				query: t.Object({ days: t.Optional(t.Numeric()) }),
				detail: {
					tags: ['Admin'],
					summary: 'Shared IP accounts detector',
				},
			},
			async ({ query }) =>
				moderationService.multiaccounts({ days: query.days ?? 30 })
		)

		.get(
			'/comments',
			{
				beforeHandle: [requireAuth, requireAdmin],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Admin'], summary: 'Recent comments feed' },
			},
			async ({ query }) =>
				moderationService.comments({
					take: query.take ?? 24,
					page: Math.max((query.page ?? 1) - 1, 0),
				})
		)

		.delete(
			'/comments/:comment_id',
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ comment_id: t.Numeric() }),
				detail: { tags: ['Admin'], summary: 'Delete comment' },
			},
			async ({ params, store, set }) => {
				const result = await moderationService.deleteComment(
					fromStore(store).user_id,
					params.comment_id
				)
				if (!result) {
					set.status = 404
					return { error: 'Comment not found' }
				}
				return result
			}
		)
)
