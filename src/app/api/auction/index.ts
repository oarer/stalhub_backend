import { t } from 'elysia'
import { Regions } from '@/types/api.type'
import { createElysia } from '@/utils/elysia'
import { auctionService } from './auction.service'

export const auctionRoutes = createElysia().group('/auction', (app) =>
	app
		.get(
			'/:region/:id/lots',
			async ({ params, query }) => {
				const { id, region } = params

				const limit = query.limit ?? '10'
				const additional = query.additional ?? 'true'
				const offset = query.offset ?? '0'

				return auctionService.lots({
					region,
					id,
					limit,
					additional,
					offset,
				})
			},
			{
				params: t.Object({
					id: t.String(),
					region: t.Enum(Regions),
				}),
				query: t.Object({
					limit: t.Optional(t.String()),
					additional: t.Optional(t.String()),
					offset: t.Optional(t.String()),
				}),
				detail: {
					tags: ['Auction'],
				},
			}
		)
		.get(
			'/:region/:id/history',
			async ({ params, query }) => {
				const { id, region } = params

				const limit = query.limit ?? '10'
				const additional = query.additional ?? 'true'
				const offset = query.offset ?? '0'

				return auctionService.history({
					region,
					id,
					limit,
					additional,
					offset,
				})
			},
			{
				params: t.Object({
					id: t.String(),
					region: t.Enum(Regions),
				}),
				query: t.Object({
					limit: t.Optional(t.String()),
					additional: t.Optional(t.String()),
					offset: t.Optional(t.String()),
				}),
				detail: {
					tags: ['Auction'],
				},
			}
		)
)
