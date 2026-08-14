import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { Regions } from '@/types/api.type'
import { clanContext } from '../context'
import { requireClanLeader, requireClanOfficer } from '../guards'
import { clanService } from '../services/clan'

export const meRoutes = clanContext
	.get('/me', ({ store }) => clanService.getMe(store.authUserId!), {
		beforeHandle: [requireAuth],
		detail: { tags: ['Clan'] },
	})
	.post('/register', ({ store }) => clanService.register(store.authUserId!), {
		beforeHandle: [requireAuth],
		detail: { tags: ['Clan'] },
	})
	.post(
		'/sync',
		({ store, body }) => clanService.sync(store.clanId!, body.region),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			body: t.Object({ region: t.Optional(t.Enum(Regions)) }),
			detail: { tags: ['Clan'] },
		}
	)
	.post('/freeze', ({ store }) => clanService.freeze(store.clanId!), {
		beforeHandle: [requireAuth, requireClanLeader],
		detail: { tags: ['Clan'] },
	})
	.get('/:clanId', ({ params }) => clanService.getClan(params.clanId), {
		beforeHandle: [requireAuth],
		params: t.Object({ clanId: t.String() }),
		detail: { tags: ['Clan'] },
	})
	.get(
		'/members/:clanId',
		({ params }) => clanService.listMembers(params.clanId),
		{
			beforeHandle: [requireAuth],
			params: t.Object({ clanId: t.String() }),
			detail: { tags: ['Clan'] },
		}
	)
