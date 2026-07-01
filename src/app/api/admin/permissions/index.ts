import { t } from 'elysia'

import { checkPermission, requireAuth } from '@/utils/auth.guard'
import { permissionService } from './permissions.service'
import { createElysia } from '@/utils/elysia'

async function requireAdmin({ store, set }: any) {
	const ok = await checkPermission(store.authUserId as string, 'rbac:manage')
	if (!ok) {
		set.status = 403
		return { error: 'Forbidden' }
	}
}

export const permissionsRoutes = createElysia().group('/permissions', (app) =>
	app

		.get(
			'',
			async () => permissionService.list(),
			{ beforeHandle: [requireAuth, requireAdmin], detail: { tags: ['Admin'] } }
		)

		.post(
			'',
			async ({ body }) => permissionService.create(body.name, body.description),
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					name: t.String({ error: 'name is required' }),
					description: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body }) => {
				const result = await permissionService.update(Number(params.id), body)
				if (!result) return { error: 'Not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					name: t.Optional(t.String()),
					description: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:id',
			async ({ params }) => {
				const ok = await permissionService.remove(Number(params.id))
				if (!ok) return { error: 'Not found' }
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)
)
