import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanLeader } from '../guards'
import { clanInviteService } from '../services/invites'

export const inviteRoutes = clanContext
	.get(
		'/invites',
		({ store }) => clanInviteService.listByClan(store.clan_id!),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			detail: { tags: ['Clan'] },
		}
	)
	.post(
		'/invites',
		async ({ store, body }) =>
			clanInviteService.createGuestAccount(
				store.clan_id!,
				`user:${store.authUserId}`,
				body.nickname
			),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ nickname: t.String({ minLength: 1 }) }),
			detail: { tags: ['Clan'] },
		}
	)
	.post(
		'/invites/bulk',
		async ({ store, body }) =>
			clanInviteService.createGuestAccountsBulk(
				store.clan_id!,
				`user:${store.authUserId}`,
				body.nicknames
			),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({
				nicknames: t.Array(t.String({ minLength: 1 }), {
					minItems: 1,
					maxItems: 100,
				}),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.delete(
		'/invites/:id',
		({ params }) => clanInviteService.revoke(params.id),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			params: t.Object({ id: t.Numeric() }),
			detail: { tags: ['Clan'] },
		}
	)
	.delete(
		'/invites/guest/:user_id',
		({ store, params }) =>
			clanInviteService.kickGuest(store.clan_id!, params.user_id),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			params: t.Object({ user_id: t.Numeric() }),
			detail: { tags: ['Clan'] },
		}
	)
