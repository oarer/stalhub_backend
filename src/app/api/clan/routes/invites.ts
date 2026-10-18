import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanLeader } from '../guards'
import { clanInviteService } from '../services/invites'

export const inviteRoutes = clanContext
	.get(
		'/invites',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			detail: { tags: ['Clan'] },
		},
		({ store }) => clanInviteService.listByClan(store.clan_id!)
	)
	.post(
		'/invites',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ nickname: t.String({ minLength: 1 }) }),
			detail: { tags: ['Clan'] },
		},
		async ({ store, body }) =>
			clanInviteService.createGuestAccount(
				store.clan_id!,
				`user:${store.authUserId}`,
				body.nickname
			)
	)
	.post(
		'/invites/bulk',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({
				nicknames: t.Array(t.String({ minLength: 1 }), {
					minItems: 1,
					maxItems: 100,
				}),
			}),
			detail: { tags: ['Clan'] },
		},
		async ({ store, body }) =>
			clanInviteService.createGuestAccountsBulk(
				store.clan_id!,
				`user:${store.authUserId}`,
				body.nicknames
			)
	)
	.delete(
		'/invites/:id',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			params: t.Object({ id: t.Numeric() }),
			detail: { tags: ['Clan'] },
		},
		({ params }) => clanInviteService.revoke(params.id)
	)
	.delete(
		'/invites/guest/:user_id',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			params: t.Object({ user_id: t.Numeric() }),
			detail: { tags: ['Clan'] },
		},
		({ store, params }) =>
			clanInviteService.kickGuest(store.clan_id!, params.user_id)
	)
