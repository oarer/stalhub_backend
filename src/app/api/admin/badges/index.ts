import { t } from 'elysia'

import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { badgesService } from './badges.service'

export const badgesRoutes = createElysia().group('/badges', (app) =>
	app
		.use(jwtPlugin)
		.get('', async () => badgesService.list(), {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		})

		.get(
			'/:id',
			async ({ params, set }) => {
				const result = await badgesService.get(Number(params.id))
				if (!result) {
					set.status = 404
					return { error: 'Badge not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'',
			async ({ body }) => {
				const result = await badgesService.create(
					body.name,
					body.icon,
					body.color,
					body.image
				)
				if ('error' in result) return result
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					name: t.String({ error: 'name is required' }),
					icon: t.Optional(t.String()),
					color: t.Optional(t.String()),
					image: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body, set }) => {
				const result = await badgesService.update(
					Number(params.id),
					body
				)
				if (!result) {
					set.status = 404
					return { error: 'Badge not found' }
				}
				if ('error' in result) return result
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				body: t.Object({
					name: t.Optional(t.String()),
					icon: t.Optional(t.String()),
					color: t.Optional(t.String()),
					image: t.Optional(t.Nullable(t.String())),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:id',
			async ({ params }) => {
				const ok = await badgesService.remove(Number(params.id))
				if (!ok) return { error: 'Badge not found' }
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:id/users/:userId',
			async ({ params, set }) => {
				const result = await badgesService.assignToUser(
					Number(params.userId),
					Number(params.id)
				)
				if (!result) {
					set.status = 404
					return { error: 'User or Badge not found' }
				}
				if ('error' in result) return result
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({
					id: t.Numeric(),
					userId: t.Numeric(),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:id/users/:userId',
			async ({ params, set }) => {
				const result = await badgesService.removeFromUser(
					Number(params.userId),
					Number(params.id)
				)
				if (!result) {
					set.status = 404
					return { error: 'User not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({
					id: t.Numeric(),
					userId: t.Numeric(),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/user/:userId',
			async ({ params, set }) => {
				const result = await badgesService.getUserBadges(
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
)
