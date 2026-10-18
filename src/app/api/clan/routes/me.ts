import { t } from 'elysia'
import { Regions } from '@/types/api.type'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanLeader, requireClanOfficer } from '../guards'
import { clanService } from '../services/clan'

export const meRoutes = clanContext
	.get(
		'/me',
		{
			beforeHandle: [requireAuth],
			detail: { tags: ['Clan'] },
		},
		({ store }) => clanService.getMe(store.authUserId!)
	)
	.get(
		'/my-clans',
		{
			beforeHandle: [requireAuth],
			detail: { tags: ['Clan'] },
		},
		({ store }) => clanService.getMyClans(store.authUserId!)
	)
	.post(
		'/switch',
		{
			beforeHandle: [requireAuth],
			body: t.Object({ clan_id: t.String() }),
			detail: { tags: ['Clan'] },
		},
		({ store, body }) =>
			clanService.switchClan(store.authUserId!, body.clan_id)
	)
	.post(
		'/register',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			detail: { tags: ['Clan'] },
		},
		({ store }) => clanService.register(store.authUserId!)
	)
	.post(
		'/sync',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			body: t.Object({ region: t.Optional(t.Enum(Regions)) }),
			detail: { tags: ['Clan'] },
		},
		({ store, body }) => clanService.sync(store.clan_id!, body.region)
	)
	.post(
		'/freeze',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			detail: { tags: ['Clan'] },
		},
		({ store }) => clanService.freeze(store.clan_id!)
	)
	.get(
		'/:clan_id',
		{
			beforeHandle: [requireAuth],
			params: t.Object({ clan_id: t.String() }),
			detail: { tags: ['Clan'] },
		},
		({ params }) => clanService.getClan(params.clan_id)
	)
	.get(
		'/members/:clan_id',
		{
			beforeHandle: [requireAuth],
			params: t.Object({ clan_id: t.String() }),
			detail: { tags: ['Clan'] },
		},
		({ params }) => clanService.listMembers(params.clan_id)
	)
	.patch(
		'/members/:id',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: t.Object({ id: t.Numeric() }),
			body: t.Object({ name: t.String({ minLength: 1 }) }),
			detail: { tags: ['Clan'] },
		},
		({ params, body, store }) =>
			clanService.updateMemberName(params.id, store.clan_id!, body.name)
	)
	.delete(
		'/members/:id',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: t.Object({ id: t.Numeric() }),
			detail: { tags: ['Clan'] },
		},
		({ params, store }) =>
			clanService.deleteMember(params.id, store.clan_id!)
	)
