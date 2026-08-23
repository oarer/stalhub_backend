import { t } from 'elysia'
import { SquadMap } from 'generated/prisma/enums'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanOfficer } from '../guards'
import { squadService } from '../services/squad'

const idParams = t.Object({ id: t.Numeric() })

export const squadsRoutes = clanContext
	.get('/squads/:clan_id', ({ params }) => squadService.list(params.clan_id), {
		beforeHandle: [requireAuth],
		params: t.Object({ clan_id: t.String() }),
		detail: { tags: ['Clan'] },
	})
	.post(
		'/squads',
		({ body, store }) =>
			squadService.create(
				store.clan_id!,
				store.authUserId!,
				body.name,
				body.map
			),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 60 }),
				map: t.Enum(SquadMap),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.post(
		'/squads/:id/slots',
		({ params, body }) =>
			squadService.assignMember(params.id, body.member_id, body.slot),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({
				member_id: t.Numeric(),
				slot: t.Numeric({ minimum: 0, maximum: 4 }),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.put(
		'/squads/:id/leader',
		({ params, body }) => squadService.setLeader(params.id, body.member_id),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({ member_id: t.Nullable(t.Numeric()) }),
			detail: { tags: ['Clan'] },
		}
	)
	.delete(
		'/squads/:id/slots/:slot',
		({ params }) => squadService.removeMember(params.id, params.slot),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: t.Object({
				id: t.Numeric(),
				slot: t.Numeric({ minimum: 0, maximum: 4 }),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.post(
		'/squads/:id/requests',
		({ params, store }) =>
			squadService.requestJoin(params.id, store.authUserId!),
		{
			beforeHandle: [requireAuth],
			params: idParams,
			detail: { tags: ['Clan'] },
		}
	)
	.post(
		'/squads/requests/:id/approve',
		({ params, store }) =>
			squadService.approveRequest(params.id, store.clan_id!),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			detail: { tags: ['Clan'] },
		}
	)
	.post(
		'/squads/requests/:id/reject',
		({ params, store }) =>
			squadService.rejectRequest(params.id, store.clan_id!),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			detail: { tags: ['Clan'] },
		}
	)
	.delete(
		'/squads/:id',
		({ params, store }) =>
			squadService.delete(params.id, store.authUserId!),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			detail: { tags: ['Clan'] },
		}
	)
	.patch(
		'/squads/:id/map',
		({ params, body, store }) =>
			squadService.updateMap(params.id, store.clan_id!, body.map),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({ map: t.Enum(SquadMap) }),
			detail: { tags: ['Clan'] },
		}
	)
