import { t } from 'elysia'
import { createElysia } from '@/utils/elysia'
import { analyticsService } from '../services/analytics'
import { clanService } from '../services/clan'

export const clansPublicRoutes = createElysia().group('/clans', (app) =>
	app
		.get('', () => clanService.listPublicClans(), {
			detail: { tags: ['Clan'] },
		})
		// статичный роут до параметризованного, иначе "stats" съестся как clan_id
		.get('/stats/summary', () => analyticsService.getPublicClansStats(), {
			detail: { tags: ['Clan'] },
		})
		.get('/:clan_id', ({ params, set }) =>
			clanService.getPublicPayload(params.clan_id).then((clan) => {
				if (!clan) set.status = 404
				return clan
			}),
		{
			params: t.Object({ clan_id: t.String() }),
			detail: { tags: ['Clan'] },
		})
)
