import { t } from 'elysia'
import { Regions } from '@/types/api.type'
import { createElysia } from '@/utils/elysia'
import { auctionService } from './auction.service'

export const auctionRoutes = createElysia({ prefix: '/auction' }).group(
    '/auction',
    (app) =>
        app
            .get(
                '/:region/:id/lots',
                async ({ params, query }) => {
                    const { id, region } = params

                    const limit = query.limit ?? '10'
                    const additional = query.additional ?? 'true'

                    return auctionService.lots({
                        region,
                        id,
                        limit,
                        additional,
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

                    return auctionService.history({
                        region,
                        id,
                        limit,
                        additional,
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
                    }),
                    detail: {
                        tags: ['Auction'],
                    },
                }
            )
)
