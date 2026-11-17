import { createElysia } from '@/utils/elysia'
import { achievementRoutes } from './achievements'
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
import { commissionsRoutes } from './commissions'
import { routeDonate } from './donate'
import { eforumRoutes } from './eforum'
import { exboRoutes } from './exbo'
import { feedRoutes } from './feed'
import { globalNotificationsRoutes } from './global-notifications'
import { routeHealth } from './health'
import { routeHideout } from './hideout'
import { internalRoutes } from './internal'
import { botRoutes } from './internal/bot'
import { loadoutRoutes } from './loadout'
import { routeLoot } from './loot'
import { map3dRoutes } from './map3d'
import { metricsRoute } from './metrics'
import { personalRoutes } from './personal'
import { playersRoute } from './player'
import { postsRoutes } from './posts'
import { serverOnlineRoutes } from './server-online'
import { tierListsRoutes } from './tier-lists'
import { unoRoutes } from './uno'
import { upgradePricesRoutes } from './upgrade-prices'
import { usersRoutes } from './users'

export const api = createElysia()
	.use(commissionsRoutes)
	.use(routeHealth)
	.use(map3dRoutes)
	.use(routeArsenal)
	.use(artifactsRoutes)
	.use(auctionRoutes)
	.use(authRoutes)
	.use(balanceRoutes)
	.use(playersRoute)
	.use(routeBarter)
	.use(routeDonate)
	.use(routeAttachments)
	.use(routeHideout)
	.use(metricsRoute)
	.use(usersRoutes)
	.use(achievementRoutes)
	.use(buildsRoutes)
	.use(feedRoutes)
	.use(articlesRoutes)
	.use(artsRoutes)
	.use(tierListsRoutes)
	.use(upgradePricesRoutes)
	.use(authorsRoutes)
	.use(exboRoutes)
	.use(globalNotificationsRoutes)
	.use(adminRoutes)
	.use(clanRoutes)
	.use(clansPublicRoutes)
	.use(eforumRoutes)
	.use(loadoutRoutes)
	.use(routeLoot)
	.use(personalRoutes)
	.use(postsRoutes)
	.use(serverOnlineRoutes)
	.use(unoRoutes)
	.use(internalRoutes)
	.use(botRoutes)
