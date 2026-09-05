import { createElysia } from '@/utils/elysia'
import { adminRoutes } from './admin'
import { routeArsenal } from './arsenal'
import { articlesRoutes } from './articles'
import { artifactsRoutes } from './artifacts'
import { artsRoutes } from './arts'
import { routeAttachments } from './attachments'
import { auctionRoutes } from './auction'
import { authRoutes } from './auth'
import { authorsRoutes } from './authors'
import { balanceRoutes } from './balance'
import { routeBarter } from './barter'
import { buildsRoutes } from './builds'
import { clanRoutes } from './clan'
import { clansPublicRoutes } from './clan/routes/public'
import { exboRoutes } from './exbo'
import { routeHealth } from './health'
import { routeHideout } from './hideout'
import { internalRoutes } from './internal'
import { botRoutes } from './internal/bot'
import { loadoutRoutes } from './loadout'
import { routeLoot } from './loot'
import { metricsRoute } from './metrics'
import { playersRoute } from './player'
import { serverOnlineRoutes } from './server-online'
import { tierListsRoutes } from './tier-lists'
import { usersRoutes } from './users'

export const api = createElysia()
	.use(routeHealth)
	.use(routeArsenal)
	.use(artifactsRoutes)
	.use(auctionRoutes)
	.use(authRoutes)
	.use(balanceRoutes)
	.use(playersRoute)
	.use(routeBarter)
	.use(routeAttachments)
	.use(routeHideout)
	.use(metricsRoute)
	.use(usersRoutes)
	.use(buildsRoutes)
	.use(articlesRoutes)
	.use(artsRoutes)
	.use(tierListsRoutes)
	.use(authorsRoutes)
	.use(exboRoutes)
	.use(adminRoutes)
	.use(clanRoutes)
	.use(clansPublicRoutes)
	.use(loadoutRoutes)
	.use(routeLoot)
	.use(serverOnlineRoutes)
	.use(internalRoutes)
	.use(botRoutes)
