import { t } from 'elysia'
import { NotificationType } from 'generated/prisma/enums'
import { env } from '@/env'
import { createElysia } from '@/utils/elysia'
import { notificationService } from './notification.service'

export const notificationRoute = createElysia().group('/notification', (app) =>
	app
		.get(
			'/',
			async () => {
				return notificationService.list()
			},
			{
				detail: {
					tags: ['Notification'],
				},
			}
		)

		.get(
			'/:id',
			async ({ params }) => {
				return notificationService.get(Number(params.id))
			},
			{
				params: t.Object({
					id: t.Numeric(),
				}),
				detail: {
					tags: ['Notification'],
				},
			}
		)

		.post(
			'/',
			async ({ body }) => {
				return notificationService.create({
					type: body.type,
					content: body.content,
					expiresAt: body.expiresAt,
				})
			},
			{
				beforeHandle: async ({ headers, set }) => {
					if (headers.authorization !== `Bearer ${env.TOKEN}`) {
						set.status = 401
						return { error: 'Unauthorized' }
					}
				},
				body: t.Object({
					type: t.Optional(t.Enum(NotificationType)),
					content: t.String({ error: 'Property content is missing' }),
					expiresAt: t.Optional(t.Date()),
				}),
				detail: {
					tags: ['Notification'],
				},
			}
		)

		.patch(
			'/:id',
			async ({ params, body }) => {
				return notificationService.update(Number(params.id), body)
			},
			{
				beforeHandle: async ({ headers, set }) => {
					if (headers.authorization !== `Bearer ${env.TOKEN}`) {
						set.status = 401
						return { error: 'Unauthorized' }
					}
				},
				params: t.Object({
					id: t.Numeric(),
				}),
				body: t.Object({
					type: t.Optional(t.Enum(NotificationType)),
					content: t.Optional(t.String()),
					expiresAt: t.Optional(t.Union([t.Date(), t.Null()])),
				}),
				detail: {
					tags: ['Notification'],
				},
			}
		)

		.delete(
			'/:id',
			async ({ params }) => {
				await notificationService.delete(Number(params.id))
				return { success: true }
			},
			{
				beforeHandle: async ({ headers, set }) => {
					if (headers.authorization !== `Bearer ${env.TOKEN}`) {
						set.status = 401
						return { error: 'Unauthorized' }
					}
				},
				params: t.Object({
					id: t.Numeric(),
				}),
				detail: {
					tags: ['Notification'],
				},
			}
		)
)
