import { t } from 'elysia'
import { createElysia } from '@/utils/elysia'
import { clanService } from '../services/clan'

export const clansPublicRoutes = createElysia().group('/clans', (app) =>
	app
		.get('', () => clanService.listPublicClans(), {
			detail: { tags: ['Clan'] },
		})
		.get('/:clanId', ({ params, set }) =>
			clanService.getPublicPayload(params.clanId).then((clan) => {
				if (!clan) set.status = 404
				return clan
			}),
		{
			params: t.Object({ clanId: t.String() }),
			detail: { tags: ['Clan'] },
		})
)
