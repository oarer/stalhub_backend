import { t } from 'elysia'
import { SquadMap } from 'generated/prisma/enums'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanOfficer } from '../guards'
import { squadService } from '../services/squad'

const idParams = t.Object({ id: t.Numeric() })

export const squadsRoutes = clanContext
	.get(
		'/squads/:clan_id',
		{
			beforeHandle: [requireAuth],
			params: t.Object({ clan_id: t.String() }),
			detail: { tags: ['Clan'] },
		},
		({ params }) => squadService.list(params.clan_id)
	)
	.post(
		'/squads',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 60 }),
				map: t.Enum(SquadMap),
			}),
			detail: { tags: ['Clan'] },
		},
		({ body, store }) =>
			squadService.create(
				store.clan_id!,
				store.authUserId!,
				body.name,
				body.map
			)
	)
	.post(
		'/squads/:id/slots',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({
				member_id: t.Numeric(),
				slot: t.Numeric({ minimum: 0, maximum: 4 }),
			}),
			detail: { tags: ['Clan'] },
		},
		({ params, body, store }) =>
			squadService.assignMember(
				params.id,
				body.member_id,
				body.slot,
				store.authUserId!
			)
	)
	.put(
		'/squads/:id/leader',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({ member_id: t.Nullable(t.Numeric()) }),
			detail: { tags: ['Clan'] },
		},
		({ params, body }) => squadService.setLeader(params.id, body.member_id)
	)
	.delete(
		'/squads/:id/slots/:slot',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: t.Object({
				id: t.Numeric(),
				slot: t.Numeric({ minimum: 0, maximum: 4 }),
			}),
			detail: { tags: ['Clan'] },
		},
		({ params }) => squadService.removeMember(params.id, params.slot)
	)
	.post(
		'/squads/:id/requests',
		{
			beforeHandle: [requireAuth],
			params: idParams,
			detail: { tags: ['Clan'] },
		},
		({ params, store }) =>
			squadService.requestJoin(params.id, store.authUserId!)
	)
	.post(
		'/squads/requests/:id/approve',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			detail: { tags: ['Clan'] },
		},
		({ params, store }) =>
			squadService.approveRequest(
				params.id,
				store.clan_id!,
				store.authUserId!
			)
	)
	.post(
		'/squads/requests/:id/reject',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			detail: { tags: ['Clan'] },
		},
		({ params, store }) =>
			squadService.rejectRequest(params.id, store.clan_id!)
	)
	.delete(
		'/squads/:id',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			detail: { tags: ['Clan'] },
		},
		({ params, store }) => squadService.delete(params.id, store.authUserId!)
	)
	.patch(
		'/squads/:id/name',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({ name: t.String({ minLength: 1, maxLength: 60 }) }),
			detail: { tags: ['Clan'] },
		},
		({ params, body, store }) =>
			squadService.updateName(params.id, store.clan_id!, body.name)
	)
	.patch(
		'/squads/:id/map',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({ map: t.Enum(SquadMap) }),
			detail: { tags: ['Clan'] },
		},
		({ params, body, store }) =>
			squadService.updateMap(params.id, store.clan_id!, body.map)
	)
	.put(
		'/squads/:id/slots/:slot/gear',
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: t.Object({
				id: t.Numeric(),
				slot: t.Numeric({ minimum: 0, maximum: 4 }),
			}),
			body: t.Object({
				gear_override: t.Nullable(
					t.Object({
						weapon_primary: t.Optional(t.Nullable(t.String())),
						weapon_secondary: t.Optional(t.Nullable(t.String())),
						weapon_pistol: t.Optional(t.Nullable(t.String())),
						armor: t.Optional(t.Nullable(t.String())),
						bio_armor: t.Optional(t.Nullable(t.String())),
						build_fat: t.Optional(t.Nullable(t.Numeric())),
						build_speed: t.Optional(t.Nullable(t.Numeric())),
					})
				),
			}),
			detail: { tags: ['Clan'] },
		},
		({ params, body, store }) =>
			squadService.setGearOverride(
				params.id,
				params.slot,
				body.gear_override,
				store.authUserId!
			)
	)
