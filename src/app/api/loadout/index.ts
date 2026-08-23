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
					(query.user_ids ?? '')
						.split(',')
						.map((s) => Number(s.trim()))
						.filter((n) => Number.isInteger(n) && n > 0)
				),
			{
				beforeHandle: [requireOptionalAuth],
				query: t.Object({ user_ids: t.Optional(t.String()) }),
				detail: { tags: ['Loadout'] },
			}
		)
		.get(
			'/:user_id',
			async ({ params, set, store }) => {
				const target_id = Number(params.user_id)
				const viewerId = fromStoreOpt(store).user_id
				const lo = await loadoutService.get(target_id)
				if (!lo || (!lo.is_public && viewerId !== target_id)) {
					set.status = 404
					return { error: 'Loadout is private or not set' }
				}
				return lo
			},
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ user_id: t.String() }),
				detail: { tags: ['Loadout'] },
			}
		)
		.put(
			'',
			async ({ body, store }) =>
				loadoutService.upsert(
					fromStore(store).user_id,
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
