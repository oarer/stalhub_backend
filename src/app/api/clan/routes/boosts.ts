import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanMember, requireClanOfficer } from '../guards'
import { boostOrderService } from '../services/boost-order'

export const boostOrderRoutes = clanContext.group('/boosts', (app) =>
	app
		.get(
			'/:date',
			({ params, store }) =>
				boostOrderService.getOrders(store.clanId!, params.date),
			{
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ date: t.String() }),
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
					body.count,
					body.date
				),
			{
				beforeHandle: [requireAuth, requireClanMember],
				body: t.Object({
					playerId: t.Numeric(),
					itemId: t.String(),
					itemName: t.String(),
					count: t.Numeric({ minimum: 1 }),
					date: t.String(),
				}),
				detail: { tags: ['Clan Boosts'] },
			}
		)
		.delete(
			'/:date/:index',
			({ params, store }) =>
				boostOrderService.removeOrder(
					store.clanId!,
					params.date,
					params.index
				),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: t.Object({
					date: t.String(),
					index: t.Numeric(),
				}),
				detail: { tags: ['Clan Boosts'] },
			}
		)
)
