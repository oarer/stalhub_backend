import { t } from 'elysia'

import { fromStore, requireAdmin, requireAuth } from '@/utils/auth.guard'
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
			'/:user_id',
			async ({ params, set }) => {
				const result = await adminUserService.get(Number(params.user_id))
				if (!result) {
					set.status = 404
					return { error: 'User not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:user_id',
			async ({ store, params, body, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.update(target_id, body)
				if (!result) return { error: 'User not found' }
				if ('error' in result) return result
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				body: t.Object({
					username: t.Optional(t.String()),
					name: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:user_id',
			async ({ store, params, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const ok = await adminUserService.remove(target_id)
				if (!ok) return { error: 'User not found' }
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:user_id/sessions',
			async ({ params }) => {
				return adminUserService.getSessions(Number(params.user_id))
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:user_id/sessions/:session_id/revoke',
			async ({ store, params, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				await adminUserService.revokeSession(params.session_id)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({
					user_id: t.Numeric(),
					session_id: t.String(),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:user_id/roles',
			async ({ params, set }) => {
				const result = await adminUserService.getUserRoles(
					Number(params.user_id)
				)
				if (!result) {
					set.status = 404
					return { error: 'User not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:user_id/roles',
			async ({ store, params, body, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.assignRole(
					target_id,
					body.role_id
				)
				if (!result) return { error: 'User or Role not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				body: t.Object({
					role_id: t.Numeric({ error: 'role_id is required' }),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:user_id/roles/:role_id',
			async ({ store, params, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.unassignRole(
					target_id,
					Number(params.role_id)
				)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric(), role_id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:user_id/ban',
			async ({ store, params, body, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
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
					target_id,
					body.reason,
					expiresAt
				)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
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
			'/:user_id/ban',
			async ({ store, params, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.unban(target_id)
				if (!result) return { error: 'User not found' }
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:user_id/customization',
			async ({ store, params, body, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const result = await adminUserService.updateCustomization(
					target_id,
					body
				)
				if (!result) return { error: 'User not found' }
				if ('error' in result) return result
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				body: t.Object({
					banner_mode: t.Optional(
						t.Enum({ COLOR: 'COLOR', IMAGE: 'IMAGE', NONE: 'NONE' })
					),
					banner_type: t.Optional(
						t.Enum({ BACKGROUND: 'BACKGROUND', HEADER: 'HEADER' })
					),
					banner_color: t.Optional(t.String()),
					banner_image: t.Optional(t.Nullable(t.String())),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:user_id/banner',
			async ({ store, params, body, set }) => {
				const target_id = Number(params.user_id)
				const canManage = await adminUserService.canManageUser(
					fromStore(store).user_id,
					target_id
				)
				if (!canManage) {
					set.status = 403
					return {
						error: 'Cannot modify user with equal or higher rank',
					}
				}
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())

				try {
					const result = await adminUserService.saveBanner(target_id, {
						name: file.name,
						type: file.type,
						buffer: buf,
					})
					if (!result) {
						set.status = 404
						return { error: 'User not found' }
					}
					return result
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ user_id: t.Numeric() }),
				body: t.Object({
					file: t.File({
						type: ['image/png', 'image/jpeg', 'image/webp'],
					}),
				}),
				detail: { tags: ['Admin'] },
			}
		)
)
