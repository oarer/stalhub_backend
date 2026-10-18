import { t } from 'elysia'
import { BoostMode } from 'generated/prisma/enums'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanLeader, requireClanMember } from '../guards'
import { clanService } from '../services/clan'
import { setClanRating } from '../services/rating'
import { normalizeRecruitmentSettings } from '../services/recruitment'

export const clanSettingsRoutes = clanContext
	.get(
		'/settings',
		{
			beforeHandle: [requireAuth, requireClanMember],
			detail: { tags: ['Clan'] },
		},
		({ store, set }) => {
			return clanService
				.getSettings(store.clan_id!)
				.then((s) => {
					if (!s) {
						set.status = 404
						return { error: 'Clan not found' }
					}
					return s
				})
				.catch(() => {
					set.status = 404
					return { error: 'Clan not found' }
				})
		}
	)
	.patch(
		'/settings',
		{
			beforeHandle: [requireAuth, requireClanMember],
			body: t.Object({
				is_public: t.Optional(t.Boolean()),
			}),
			detail: { tags: ['Clan'] },
		},
		({ store, body, set }) => {
			const clan_id = store.clan_id!
			return clanService.updatePublicSettings(clan_id, body).catch(() => {
				set.status = 404
				return { error: 'Clan not found' }
			})
		}
	)
	.patch(
		'/schedule',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({
				brawls_per_week: t.Optional(
					t.Numeric({ minimum: 0, maximum: 4 })
				),
				brawls_mandatory: t.Optional(t.Boolean()),
				sunday_activity: t.Optional(
					t.Enum({
						BASE_CAPTURE: 'BASE_CAPTURE',
						BRAWL: 'BRAWL',
						NONE: 'NONE',
					})
				),
			}),
			detail: { tags: ['Clan'] },
		},
		({ store, body }) =>
			clanService.updateSchedule(store.clan_id!, body as never)
	)
	.patch(
		'/recruiting',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ recruiting: t.Boolean() }),
			detail: { tags: ['Clan'] },
		},
		({ store, body }) =>
			clanService.updateRecruiting(store.clan_id!, body.recruiting)
	)
	.patch(
		'/recruitment',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({
				leader_discord: t.String({ minLength: 1, maxLength: 100 }),
				clan_discord: t.Nullable(t.String({ maxLength: 255 })),
				paid_recruitment: t.Boolean(),
				guilds_per_week: t.Nullable(
					t.Numeric({ minimum: 0, maximum: 999 })
				),
			}),
			detail: { tags: ['Clan'] },
		},
		async ({ store, body, set }) => {
			try {
				return await clanService.updateRecruitment(
					store.clan_id!,
					normalizeRecruitmentSettings(body)
				)
			} catch (error) {
				set.status = 400
				return {
					error:
						error instanceof Error
							? error.message
							: 'Invalid recruitment settings',
				}
			}
		}
	)
	.patch(
		'/rating',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ rating: t.Numeric({ minimum: 0 }) }),
			detail: { tags: ['Clan'] },
		},
		({ store, body }) => setClanRating(store.clan_id!, body.rating)
	)
	.patch(
		'/boost-mode',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ boost_mode: t.Enum(BoostMode) }),
			detail: { tags: ['Clan'] },
		},
		({ store, body }) =>
			clanService.updateBoostMode(store.clan_id!, body.boost_mode)
	)
	.patch(
		'/grenade-mode',
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ grenade_mode: t.Enum(BoostMode) }),
			detail: { tags: ['Clan'] },
		},
		({ store, body }) =>
			clanService.updateGrenadeMode(store.clan_id!, body.grenade_mode)
	)
