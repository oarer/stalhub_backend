import { t } from 'elysia'
import { prisma } from '@/lib/prisma'
import {
	canManageRole,
	fromStore,
	getUserMaxRank,
	requireAdmin,
	requireAuth,
} from '@/utils/auth.guard'
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
			async ({ store, body, set }) => {
				if (body.rank !== undefined) {
					const actorRank = await getUserMaxRank(
						fromStore(store).user_id
					)
					if (actorRank <= body.rank) {
						set.status = 403
						return {
							error: 'Cannot create role with rank equal or higher than your own',
						}
					}
				}
				return roleService.create(
					body.name,
					body.description,
					body.rank
				)
			},
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
			async ({ store, params, body, set }) => {
				const role = await prisma.role.findUnique({
					where: { id: Number(params.id) },
					select: { rank: true },
				})
				if (!role) {
					set.status = 404
					return { error: 'Not found' }
				}

				const ok = await canManageRole(
					fromStore(store).user_id,
					role.rank
				)
				if (!ok) {
					set.status = 403
					return {
						error: 'Cannot modify role with equal or higher rank',
					}
				}

				if (body.rank !== undefined) {
					const actorRank = await getUserMaxRank(
						fromStore(store).user_id
					)
					if (actorRank <= body.rank) {
						set.status = 403
						return {
							error: 'Cannot set rank equal or higher than your own',
						}
					}
				}

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
			async ({ store, params, set }) => {
				const role = await prisma.role.findUnique({
					where: { id: Number(params.id) },
					select: { rank: true },
				})
				if (!role) {
					set.status = 404
					return { error: 'Not found' }
				}

				const ok = await canManageRole(
					fromStore(store).user_id,
					role.rank
				)
				if (!ok) {
					set.status = 403
					return {
						error: 'Cannot delete role with equal or higher rank',
					}
				}

				const deleted = await roleService.remove(Number(params.id))
				if (!deleted) return { error: 'Not found' }
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
			async ({ store, params, body, set }) => {
				const role = await prisma.role.findUnique({
					where: { id: Number(params.id) },
					select: { rank: true },
				})
				if (!role) {
					set.status = 404
					return { error: 'Role not found' }
				}

				const ok = await canManageRole(
					fromStore(store).user_id,
					role.rank
				)
				if (!ok) {
					set.status = 403
					return {
						error: 'Cannot modify role with equal or higher rank',
					}
				}

				const result = await roleService.addPermissions(
					Number(params.id),
					body.permission_ids
				)
				if (!result) return { error: 'Role not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					permission_ids: t.Array(t.Numeric(), {
						error: 'permission_ids is required',
					}),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:id/permissions',
			async ({ store, params, body, set }) => {
				const role = await prisma.role.findUnique({
					where: { id: Number(params.id) },
					select: { rank: true },
				})
				if (!role) {
					set.status = 404
					return { error: 'Role not found' }
				}

				const ok = await canManageRole(
					fromStore(store).user_id,
					role.rank
				)
				if (!ok) {
					set.status = 403
					return {
						error: 'Cannot modify role with equal or higher rank',
					}
				}

				const result = await roleService.removePermissions(
					Number(params.id),
					body.permission_ids
				)
				if (!result) return { error: 'Role not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					permission_ids: t.Array(t.Numeric(), {
						error: 'permission_ids is required',
					}),
				}),
				detail: { tags: ['Admin'] },
			}
		)
)
