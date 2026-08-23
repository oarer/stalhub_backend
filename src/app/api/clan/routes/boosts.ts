import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanMember, requireClanOfficer } from '../guards'
import { boostOrderService } from '../services/boost-order'

export const boostOrderRoutes = clanContext.group('/boosts', (app) =>
	app
		.get(
			'',
			({ store }) =>
				boostOrderService.getOrders(store.clan_id!),
			{
				beforeHandle: [requireAuth, requireClanMember],
				detail: { tags: ['Clan Boosts'] },
			}
		)
		.post(
			'',
			({ store, body }) =>
				boostOrderService.addOrder(
					store.clan_id!,
					body.player_id,
					body.item_id,
					body.item_name,
					body.count
				),
			{
				beforeHandle: [requireAuth, requireClanMember],
				body: t.Object({
					player_id: t.Numeric(),
					item_id: t.String(),
					item_name: t.String(),
					count: t.Numeric({ minimum: 1 }),
				}),
				detail: { tags: ['Clan Boosts'] },
			}
		)
		.delete(
			'/:index',
			({ params, store }) =>
				boostOrderService.removeOrder(
					store.clan_id!,
					params.index
				),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: t.Object({
					index: t.Numeric(),
				}),
				detail: { tags: ['Clan Boosts'] },
			}
		)
)
