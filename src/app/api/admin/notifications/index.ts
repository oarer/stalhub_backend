import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { adminNotificationService } from './notifications.service'

const notificationBody = t.Object({
	title: t.String({ error: 'title is required' }),
	content: t.String({ error: 'content is required', maxLength: 5000 }),
	type: t.Optional(t.Numeric()),
	link: t.Optional(t.String()),
})

export const notificationsRoutes = createElysia().group(
	'/notifications',
	(app) =>
		app
			.use(jwtPlugin)

			.post(
				'/broadcast',
				async ({ body }) => {
					return adminNotificationService.sendToAll(body)
				},
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: notificationBody,
					detail: { tags: ['Admin'] },
				}
			)

			.post(
				'/user/:userId',
				async ({ params, body, set }) => {
					const result = await adminNotificationService.sendToUser(
						Number(params.userId),
						body
					)
					if (!result) {
						set.status = 404
						return { error: 'User not found' }
					}
					return result
				},
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ userId: t.String() }),
					body: notificationBody,
					detail: { tags: ['Admin'] },
				}
			)

			.post(
				'/batch',
				async ({ body }) => {
					return adminNotificationService.sendToUsers(
						body.userIds,
						{
							title: body.title,
							content: body.content,
							type: body.type,
							link: body.link,
						}
					)
				},
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						userIds: t.Array(t.Number()),
						title: t.String({ error: 'title is required' }),
						content: t.String({ error: 'content is required', maxLength: 5000 }),
						type: t.Optional(t.Numeric()),
						link: t.Optional(t.String()),
					}),
					detail: { tags: ['Admin'] },
				}
			)
)
