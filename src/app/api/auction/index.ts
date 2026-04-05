import { createElysia } from '@/utils/elysia'
import { lotsHistoryRoute } from './history'
import { lotsRoute } from './lots'

export const auctionRoutes = createElysia({ prefix: '/auction' })
    .use(lotsHistoryRoute)
    .use(lotsRoute)