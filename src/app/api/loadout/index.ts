import { t } from 'elysia'
import {
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { loadoutService } from './loadout.service'

export const loadoutRoutes = createElysia().group('/loadout', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			async ({ query }) =>
				loadoutService.getMany(
					(query.userIds ?? '')
						.split(',')
						.map((s) => Number(s.trim()))
						.filter((n) => Number.isInteger(n) && n > 0)
				),
			{
				beforeHandle: [requireOptionalAuth],
				query: t.Object({ userIds: t.Optional(t.String()) }),
				detail: { tags: ['Loadout'] },
			}
		)
		.get(
			'/:userId',
			async ({ params, set, store }) => {
				const targetId = Number(params.userId)
				const viewerId = fromStoreOpt(store).userId
				const lo = await loadoutService.get(targetId)
				if (!lo || (!lo.is_public && viewerId !== targetId)) {
					set.status = 404
					return { error: 'Loadout is private or not set' }
				}
				return lo
			},
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ userId: t.String() }),
				detail: { tags: ['Loadout'] },
			}
		)
		.put(
			'',
			async ({ body, store }) =>
				loadoutService.upsert(
					fromStore(store).userId,
					body.data,
					body.is_public ?? false
				),
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					data: t.Any(),
					is_public: t.Optional(t.Boolean()),
				}),
				detail: { tags: ['Loadout'] },
			}
		)
)
