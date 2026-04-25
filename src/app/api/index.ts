import { createElysia } from '@/utils/elysia'
import { routeArsenal } from './arsenal'
import { auctionRoutes } from './auction'
import { routeBarter } from './barter'
import { routeHealth } from './health'
import { playersRoute } from './player'

export const api = createElysia()
	.use(routeHealth)
	.use(routeArsenal)
	.use(auctionRoutes)
	.use(playersRoute)
	.use(routeBarter)

