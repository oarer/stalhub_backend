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
		},
		{
			beforeHandle: [requireAuth, requireClanMember],
			detail: { tags: ['Clan'] },
		}
	)
	.patch(
		'/settings',
		({ store, body, set }) => {
			const clan_id = store.clan_id!
			return clanService.updatePublicSettings(clan_id, body).catch(() => {
				set.status = 404
				return { error: 'Clan not found' }
			})
		},
		{
			beforeHandle: [requireAuth, requireClanMember],
			body: t.Object({
				is_public: t.Optional(t.Boolean()),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.patch(
		'/schedule',
		({ store, body }) => clanService.updateSchedule(store.clan_id!, body),
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
		}
	)
	.patch(
		'/recruiting',
		({ store, body }) =>
			clanService.updateRecruiting(store.clan_id!, body.recruiting),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ recruiting: t.Boolean() }),
			detail: { tags: ['Clan'] },
		}
	)
	.patch(
		'/recruitment',
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
		},
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
		}
	)
	.patch(
		'/rating',
		({ store, body }) => setClanRating(store.clan_id!, body.rating),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ rating: t.Numeric({ minimum: 0 }) }),
			detail: { tags: ['Clan'] },
		}
	)
	.patch(
		'/boost-mode',
		({ store, body }) =>
			clanService.updateBoostMode(store.clan_id!, body.boost_mode),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ boost_mode: t.Enum(BoostMode) }),
			detail: { tags: ['Clan'] },
		}
	)
	.patch(
		'/grenade-mode',
		({ store, body }) =>
			clanService.updateGrenadeMode(store.clan_id!, body.grenade_mode),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ grenade_mode: t.Enum(BoostMode) }),
			detail: { tags: ['Clan'] },
		}
	)
