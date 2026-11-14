import { t } from 'elysia'

import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { adminAchievementService } from './achievement.service'

export const adminAchievementRoutes = createElysia().group(
	'/achievements',
	(app) =>
		app
			.use(jwtPlugin)
			.get(
				'',
				{
					beforeHandle: [requireAuth, requireAdmin],
					detail: { tags: ['Admin'] },
				},
				async () => adminAchievementService.list()
			)
			.get(
				'/:id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ id: t.Numeric() }),
					detail: { tags: ['Admin'] },
				},
				async ({ params, set }) => {
					const result = await adminAchievementService.get(Number(params.id))
					if (!result) {
						set.status = 404
						return { error: 'Achievement not found' }
					}
					return result
				}
			)
			.post(
				'',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						slug: t.String(),
						title: t.String(),
						description: t.Optional(t.String()),
						icon: t.Optional(t.String()),
						rarity: t.Optional(t.String()),
						hidden: t.Optional(t.Boolean()),
					}),
					detail: { tags: ['Admin'] },
				},
				async ({ body }) => adminAchievementService.create(body)
			)
			.patch(
				'/:id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ id: t.Numeric() }),
					body: t.Object({
						slug: t.Optional(t.String()),
						title: t.Optional(t.String()),
						description: t.Optional(t.String()),
						icon: t.Optional(t.String()),
						rarity: t.Optional(t.String()),
						hidden: t.Optional(t.Boolean()),
					}),
					detail: { tags: ['Admin'] },
				},
				async ({ params, body, set }) => {
					const result = await adminAchievementService.update(
						Number(params.id),
						body
					)
					if (!result) {
						set.status = 404
						return { error: 'Achievement not found' }
					}
					return result
				}
			)
			.delete(
				'/:id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ id: t.Numeric() }),
					detail: { tags: ['Admin'] },
				},
				async ({ params }) => {
					const ok = await adminAchievementService.remove(Number(params.id))
					if (!ok) return { error: 'Achievement not found' }
					return { success: true }
				}
			)
			.post(
				'/:id/users/:user_id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({
						id: t.Numeric(),
						user_id: t.Numeric(),
					}),
					detail: { tags: ['Admin'] },
				},
				async ({ params, set }) => {
					const result = await adminAchievementService.assignToUser(
						Number(params.user_id),
						Number(params.id)
					)
					if (!result) {
						set.status = 404
						return { error: 'User or Achievement not found' }
					}
					return result
				}
			)
			.delete(
				'/:id/users/:user_id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({
						id: t.Numeric(),
						user_id: t.Numeric(),
					}),
					detail: { tags: ['Admin'] },
				},
				async ({ params, set }) => {
					const result = await adminAchievementService.removeFromUser(
						Number(params.user_id),
						Number(params.id)
					)
					if (!result) {
						set.status = 404
						return { error: 'User not found' }
					}
					return result
				}
			)
			.get(
				'/user/:user_id',
				{
					beforeHandle: [requireAuth, requireAdmin],
					params: t.Object({ user_id: t.Numeric() }),
					detail: { tags: ['Admin'] },
				},
				async ({ params, set }) => {
					const result = await adminAchievementService.getUserAchievements(
						Number(params.user_id)
					)
					if (!result) {
						set.status = 404
						return { error: 'User not found' }
					}
					return result
				}
			)
	)
