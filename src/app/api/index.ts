import { createElysia } from '@/utils/elysia'
import { adminRoutes } from './admin'
import { routeArsenal } from './arsenal'
import { articlesRoutes } from './articles'
import { auctionRoutes } from './auction'
import { authRoutes } from './auth'
import { routeBarter } from './barter'
import { buildsRoutes } from './builds'
import { routeHealth } from './health'
import { routeHideout } from './hideout'
import { metricsRoute } from './metrics'
import { playersRoute } from './player'
import { usersRoutes } from './users'

export const api = createElysia()
	.use(routeHealth)
	.use(routeArsenal)
	.use(auctionRoutes)
	.use(authRoutes)
	.use(playersRoute)
	.use(routeBarter)
	.use(routeHideout)
	.use(metricsRoute)
	.use(usersRoutes)
	.use(buildsRoutes)
	.use(articlesRoutes)
	.use(adminRoutes)