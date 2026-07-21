import { t } from 'elysia'

import {
	fromStore,
	requireAdmin,
	requireAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { adminUserService } from './users.service'

export const usersRoutes = createElysia().group('/users', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			async ({ query }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				return adminUserService.list(take, page, query.search)
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					search: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:userId',
			async ({ params, set }) => {
				const result = await adminUserService.get(Number(params.userId))
				if (!result) {
					set.status = 404
					return { error: 'User not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:userId',
			async ({ store, params, body, set }) => {
				const targetId = Number(params.userId)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).userId,
					targetId
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.update(targetId, body)
				if (!result) return { error: 'User not found' }
				if ('error' in result) return result
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric() }),
				body: t.Object({
					username: t.Optional(t.String()),
					name: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:userId',
			async ({ store, params, set }) => {
				const targetId = Number(params.userId)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).userId,
					targetId
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const ok = await adminUserService.remove(targetId)
				if (!ok) return { error: 'User not found' }
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:userId/sessions',
			async ({ params }) => {
				return adminUserService.getSessions(Number(params.userId))
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:userId/sessions/:sessionId/revoke',
			async ({ store, params, set }) => {
				const targetId = Number(params.userId)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).userId,
					targetId
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				await adminUserService.revokeSession(params.sessionId)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({
					userId: t.Numeric(),
					sessionId: t.String(),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:userId/roles',
			async ({ params, set }) => {
				const result = await adminUserService.getUserRoles(
					Number(params.userId)
				)
				if (!result) {
					set.status = 404
					return { error: 'User not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:userId/roles',
			async ({ store, params, body, set }) => {
				const targetId = Number(params.userId)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).userId,
					targetId
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.assignRole(
					targetId,
					body.roleId
				)
				if (!result) return { error: 'User or Role not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric() }),
				body: t.Object({
					roleId: t.Numeric({ error: 'roleId is required' }),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:userId/roles/:roleId',
			async ({ store, params, set }) => {
				const targetId = Number(params.userId)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).userId,
					targetId
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.unassignRole(
					targetId,
					Number(params.roleId)
				)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric(), roleId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:userId/ban',
			async ({ store, params, body, set }) => {
				const targetId = Number(params.userId)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).userId,
					targetId
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const expiresAt = body.expires_in
					? new Date(Date.now() + body.expires_in * 1000)
					: undefined
				const result = await adminUserService.ban(
					targetId,
					body.reason,
					expiresAt
				)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric() }),
				body: t.Object({
					reason: t.Optional(t.String()),
					expires_in: t.Optional(
						t.Numeric({ description: 'Ban duration in seconds' })
					),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:userId/ban',
			async ({ store, params, set }) => {
				const targetId = Number(params.userId)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).userId,
					targetId
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.unban(targetId)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)
)
