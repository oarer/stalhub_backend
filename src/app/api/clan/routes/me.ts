import { t } from 'elysia'
import { Regions } from '@/types/api.type'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanLeader, requireClanOfficer } from '../guards'
import { clanService } from '../services/clan'

export const meRoutes = clanContext
	.get('/me', ({ store }) => clanService.getMe(store.authUserId!), {
		beforeHandle: [requireAuth],
		detail: { tags: ['Clan'] },
	})
	.get('/my-clans', ({ store }) => clanService.getMyClans(store.authUserId!), {
		beforeHandle: [requireAuth],
		detail: { tags: ['Clan'] },
	})
	.post(
		'/switch',
		({ store, body }) =>
			clanService.switchClan(store.authUserId!, body.clan_id),
		{
			beforeHandle: [requireAuth],
			body: t.Object({ clan_id: t.String() }),
			detail: { tags: ['Clan'] },
		}
	)
	.post('/register', ({ store }) => clanService.register(store.authUserId!), {
		beforeHandle: [requireAuth, requireClanLeader],
		detail: { tags: ['Clan'] },
	})
	.post(
		'/sync',
		({ store, body }) => clanService.sync(store.clan_id!, body.region),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			body: t.Object({ region: t.Optional(t.Enum(Regions)) }),
			detail: { tags: ['Clan'] },
		}
	)
	.post('/freeze', ({ store }) => clanService.freeze(store.clan_id!), {
		beforeHandle: [requireAuth, requireClanLeader],
		detail: { tags: ['Clan'] },
	})
	.get('/:clan_id', ({ params }) => clanService.getClan(params.clan_id), {
		beforeHandle: [requireAuth],
		params: t.Object({ clan_id: t.String() }),
		detail: { tags: ['Clan'] },
	})
	.get(
		'/members/:clan_id',
		({ params }) => clanService.listMembers(params.clan_id),
		{
			beforeHandle: [requireAuth],
			params: t.Object({ clan_id: t.String() }),
			detail: { tags: ['Clan'] },
		}
	)
