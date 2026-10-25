import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { adminNotificationService } from './notifications.service'

const notificationBody = t.Object({
	title: t.String({}),
	content: t.String({ maxLength: 5000 }),
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
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: notificationBody,
					detail: { tags: ['Admin'] },
				},
				async ({ body }) => {
					return adminNotificationService.sendToAll(body)
				}
			)

			.post(
				'/targeted',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						target: t.Object({
							kind: t.Union([
								t.Literal('all'),
								t.Literal('role'),
								t.Literal('clan'),
								t.Literal('banned'),
							]),
							role_id: t.Optional(t.Numeric()),
							clan_id: t.Optional(t.String()),
						}),
						title: t.String({}),
						content: t.String({ maxLength: 5000 }),
						type: t.Optional(t.Numeric()),
						link: t.Optional(t.String()),
					}),
					detail: {
						tags: ['Admin'],
						summary: 'Send notification to a target audience',
					},
				},
				async ({ body }) => {
					return adminNotificationService.sendToTarget(
						{
							title: body.title,
							content: body.content,
							type: body.type,
							link: body.link,
						},
						{
							kind: body.target.kind,
							role_id: body.target.role_id,
							clan_id: body.target.clan_id,
						}
					)
				}
			)

			.post(
				'/estimate',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						target: t.Object({
							kind: t.Union([
								t.Literal('all'),
								t.Literal('role'),
								t.Literal('clan'),
								t.Literal('banned'),
							]),
							role_id: t.Optional(t.Numeric()),
							clan_id: t.Optional(t.String()),
						}),
					}),
					detail: {
						tags: ['Admin'],
						summary: 'Count target audience',
					},
				},
				async ({ body }) => {
					return {
						count: await adminNotificationService.countTarget({
							kind: body.target.kind,
							role_id: body.target.role_id,
							clan_id: body.target.clan_id,
						}),
					}
				}
			)

			.get(
				'/stats',
				{
					beforeHandle: [requireAuth, requireAdmin],
					detail: { tags: ['Admin'], summary: 'Notification stats' },
				},
				async () => adminNotificationService.stats()
			)

			.post(
				'/user/:user_id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ user_id: t.String() }),
					body: notificationBody,
					detail: { tags: ['Admin'] },
				},
				async ({ params, body, set }) => {
					const result = await adminNotificationService.sendToUser(
						Number(params.user_id),
						body
					)
					if (!result) {
						set.status = 404
						return { error: 'User not found' }
					}
					return result
				}
			)

			.post(
				'/batch',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						user_ids: t.Array(t.Number()),
						title: t.String({}),
						content: t.String({
							maxLength: 5000,
						}),
						type: t.Optional(t.Numeric()),
						link: t.Optional(t.String()),
					}),
					detail: { tags: ['Admin'] },
				},
				async ({ body }) => {
					return adminNotificationService.sendToUsers(body.user_ids, {
						title: body.title,
						content: body.content,
						type: body.type,
						link: body.link,
					})
				}
			)
)
