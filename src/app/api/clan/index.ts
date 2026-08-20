import { createElysia } from '@/utils/elysia'
import { absencesRoutes } from './routes/absences'
import { analyticsRoutes } from './routes/analytics'
import { boostOrderRoutes } from './routes/boosts'
import { clanBotRoutes } from './routes/bot'
import { goldRoutes } from './routes/gold'
import { inviteRoutes } from './routes/invites'
import { listingRoutes } from './routes/listing'
import { meRoutes } from './routes/me'
import { notesRoutes } from './routes/notes'
import { clanSettingsRoutes } from './routes/settings'
import { squadsRoutes } from './routes/squads'

export const clanRoutes = createElysia().group('/clan', (app) =>
	app
		.use(meRoutes)
		.use(squadsRoutes)
		.use(goldRoutes)
		.use(absencesRoutes)
		.use(analyticsRoutes)
		.use(clanSettingsRoutes)
		.use(clanBotRoutes)
		.use(inviteRoutes)
		.use(notesRoutes)
		.use(listingRoutes)
		.use(boostOrderRoutes)
)
