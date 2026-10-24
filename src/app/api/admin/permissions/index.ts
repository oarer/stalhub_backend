import { t } from 'elysia'

import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { permissionService } from './permissions.service'

export const permissionsRoutes = createElysia().group('/permissions', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			{
				beforeHandle: [requireAuth, requireAdmin],
				detail: { tags: ['Admin'] },
			},
			async () => permissionService.list()
		)

		.post(
			'',
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					name: t.String({}),
					description: t.Optional(t.String()),
					role_id: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Admin'] },
			},
			async ({ body }) =>
				permissionService.create(
					body.name,
					body.description,
					body.role_id
				)
		)

		.patch(
			'/:id',
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					name: t.Optional(t.String()),
					description: t.Optional(t.String()),
					role_id: t.Optional(t.Nullable(t.Numeric())),
				}),
				detail: { tags: ['Admin'] },
			},
			async ({ params, body }) => {
				const result = await permissionService.update(
					Number(params.id),
					body
				)
				if (!result) return { error: 'Not found' }
				return result
			}
		)

		.delete(
			'/:id',
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Admin'] },
			},
			async ({ params }) => {
				const ok = await permissionService.remove(Number(params.id))
				if (!ok) return { error: 'Not found' }
				return { success: true }
			}
		)
)
