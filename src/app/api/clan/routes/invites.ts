import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanLeader } from '../guards'
import { clanInviteService } from '../services/invites'

export const inviteRoutes = clanContext
	.get(
		'/invites',
		({ store }) => clanInviteService.listByClan(store.clanId!),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			detail: { tags: ['Clan'] },
		}
	)
	.post(
		'/invites',
		async ({ store, body }) =>
			clanInviteService.createGuestAccount(
				store.clanId!,
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
				store.clanId!,
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
		'/invites/guest/:userId',
		({ store, params }) =>
			clanInviteService.kickGuest(store.clanId!, params.userId),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			params: t.Object({ userId: t.Numeric() }),
			detail: { tags: ['Clan'] },
		}
	)
