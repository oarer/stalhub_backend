import { createElysia } from '@/utils/elysia'
import { routeArsenal } from './arsenal'
import { auctionRoutes } from './auction'
import { routeHealth } from './health'
import { playerRoute } from './player'

export const routes = createElysia({ prefix: '/api' })
    .use(routeHealth)
    .use(routeArsenal)
    .use(auctionRoutes)
    .use(playerRoute)
