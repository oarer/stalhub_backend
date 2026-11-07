import { t } from 'elysia'
import { globalNotificationService } from '@/app/api/global-notifications/global-notifications.service'
import { validateGlobalNotificationPayload } from '@/app/api/global-notifications/global-notifications.validation'
import { fromStore, requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'

const bodySchema = t.Any()

export const globalNotificationAdminRoutes = createElysia().group(
	'/global',
	(app) =>
		app
			.use(jwtPlugin)
			.get(
				'',
				{
					beforeHandle: [requireAuth, requireAdmin],
					detail: {
						tags: ['Admin'],
						summary: 'List global notifications',
					},
				},
				() => globalNotificationService.listAdmin()
			)
			.get(
				'/:id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ id: t.Numeric() }),
					detail: {
						tags: ['Admin'],
						summary: 'Get a global notification',
					},
				},
				async ({ params, set }) => {
					const result = await globalNotificationService.get(
						Number(params.id)
					)
					if (!result) {
						set.status = 404
						return { error: 'Global notification not found' }
					}
					return result
				}
			)
			.post(
				'',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: bodySchema,
					detail: {
						tags: ['Admin'],
						summary: 'Create a global notification',
					},
				},
				async ({ body, store, set }) => {
					const parsed = validateGlobalNotificationPayload(body)
					if (!parsed.data) {
						set.status = 400
						return { error: parsed.error }
					}

					try {
						const result = await globalNotificationService.create(
							{
								title: parsed.data.title as string,
								type: parsed.data.type as
									| 'INFO'
									| 'WARNING'
									| 'DANGER',
								content: parsed.data.content ?? [],
								is_active: parsed.data.is_active ?? true,
								starts_at: parsed.data.starts_at as Date,
								expires_at: parsed.data.expires_at ?? null,
							},
							fromStore(store).user_id
						)
						set.status = 201
						return result
					} catch (error) {
						set.status = 400
						return { error: (error as Error).message }
					}
				}
			)
			.patch(
				'/:id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ id: t.Numeric() }),
					body: bodySchema,
					detail: {
						tags: ['Admin'],
						summary: 'Update a global notification',
					},
				},
				async ({ params, body, set }) => {
					const parsed = validateGlobalNotificationPayload(body, {
						partial: true,
					})
					if (!parsed.data) {
						set.status = 400
						return { error: parsed.error }
					}

					try {
						const result = await globalNotificationService.update(
							Number(params.id),
							parsed.data
						)
						if (!result) {
							set.status = 404
							return { error: 'Global notification not found' }
						}
						return result
					} catch (error) {
						set.status = 400
						return { error: (error as Error).message }
					}
				}
			)
			.delete(
				'/:id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ id: t.Numeric() }),
					detail: {
						tags: ['Admin'],
						summary: 'Delete a global notification',
					},
				},
				async ({ params, set }) => {
					const deleted = await globalNotificationService.remove(
						Number(params.id)
					)
					if (!deleted) {
						set.status = 404
						return { error: 'Global notification not found' }
					}
					return { success: true }
				}
			)
)
