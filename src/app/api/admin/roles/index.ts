import { t } from 'elysia'

import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { roleService } from './roles.service'

export const rolesRoutes = createElysia().group('/roles', (app) =>
	app
		.use(jwtPlugin)
		.get('', async () => roleService.list(), {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		})

		.post(
			'',
			async ({ body }) =>
				roleService.create(body.name, body.description, body.rank),
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					name: t.String({ error: 'name is required' }),
					description: t.Optional(t.String()),
					rank: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body }) => {
				const result = await roleService.update(Number(params.id), body)
				if (!result) return { error: 'Not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					name: t.Optional(t.String()),
					description: t.Optional(t.String()),
					rank: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:id',
			async ({ params }) => {
				const ok = await roleService.remove(Number(params.id))
				if (!ok) return { error: 'Not found' }
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:id/permissions',
			async ({ params, body }) => {
				const result = await roleService.addPermissions(
					Number(params.id),
					body.permissionIds
				)
				if (!result) return { error: 'Role not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					permissionIds: t.Array(t.Numeric(), {
						error: 'permissionIds is required',
					}),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:id/permissions',
			async ({ params, body }) => {
				const result = await roleService.removePermissions(
					Number(params.id),
					body.permissionIds
				)
				if (!result) return { error: 'Role not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					permissionIds: t.Array(t.Numeric(), {
						error: 'permissionIds is required',
					}),
				}),
				detail: { tags: ['Admin'] },
			}
		)
)
