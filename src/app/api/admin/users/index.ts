import { t } from 'elysia'

import { checkPermission, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { adminUserService } from './users.service'

async function requireAdmin({ store, set }: any) {
	const ok = await checkPermission(store.authUserId as string, 'user:manage')
	if (!ok) {
		set.status = 403
		return { error: 'Forbidden' }
	}
}

export const usersRoutes = createElysia().group('/users', (app) =>
	app
		.get(
			'',
			async ({ query }) => {
				const take = query.take ?? 24
				const page = query.page ?? 0
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
				const result = await adminUserService.get(params.userId)
				if (!result) {
					set.status = 404
					return { error: 'User not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:userId',
			async ({ params, body }) => {
				const result = await adminUserService.update(
					params.userId,
					body
				)
				if (!result) return { error: 'User not found' }
				if ('error' in result) return result
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String() }),
				body: t.Object({
					username: t.Optional(t.String()),
					name: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:userId',
			async ({ params }) => {
				const ok = await adminUserService.remove(params.userId)
				if (!ok) return { error: 'User not found' }
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:userId/sessions',
			async ({ params }) => {
				return adminUserService.getSessions(params.userId)
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:userId/sessions/:sessionId/revoke',
			async ({ params }) => {
				await adminUserService.revokeSession(params.sessionId)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String(), sessionId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:userId/roles',
			async ({ params, set }) => {
				const result = await adminUserService.getUserRoles(
					params.userId
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
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:userId/roles',
			async ({ params, body }) => {
				const result = await adminUserService.assignRole(
					params.userId,
					body.roleId
				)
				if (!result) return { error: 'User or Role not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String() }),
				body: t.Object({
					roleId: t.Numeric({ error: 'roleId is required' }),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:userId/roles/:roleId',
			async ({ params }) => {
				const result = await adminUserService.unassignRole(
					params.userId,
					Number(params.roleId)
				)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String(), roleId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:userId/ban',
			async ({ params, body }) => {
				const expiresAt = body.expires_in
					? new Date(Date.now() + body.expires_in * 1000)
					: undefined
				const result = await adminUserService.ban(
					params.userId,
					body.reason,
					expiresAt
				)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String() }),
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
			async ({ params }) => {
				const result = await adminUserService.unban(params.userId)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ userId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)
)
