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
				boostOrderService.getOrders(store.clanId!),
			{
				beforeHandle: [requireAuth, requireClanMember],
				detail: { tags: ['Clan Boosts'] },
			}
		)
		.post(
			'',
			({ store, body }) =>
				boostOrderService.addOrder(
					store.clanId!,
					body.playerId,
					body.itemId,
					body.itemName,
					body.count
				),
			{
				beforeHandle: [requireAuth, requireClanMember],
				body: t.Object({
					playerId: t.Numeric(),
					itemId: t.String(),
					itemName: t.String(),
					count: t.Numeric({ minimum: 1 }),
				}),
				detail: { tags: ['Clan Boosts'] },
			}
		)
		.delete(
			'/:index',
			({ params, store }) =>
				boostOrderService.removeOrder(
					store.clanId!,
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
