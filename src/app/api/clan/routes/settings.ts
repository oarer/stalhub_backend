import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanLeader, requireClanMember } from '../guards'
import { clanService } from '../services/clan'

export const clanSettingsRoutes = clanContext
	.get('/settings', ({ store, set }) => {
		return clanService
			.getSettings(store.clanId!)
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
	}, {
		beforeHandle: [requireAuth, requireClanMember],
		detail: { tags: ['Clan'] },
	})
	.patch(
		'/settings',
		({ store, body, set }) => {
			const clanId = store.clanId!
			return clanService
				.updatePublicSettings(clanId, body)
				.catch(() => {
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
		({ store, body }) => clanService.updateSchedule(store.clanId!, body),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({
				brawlsPerWeek: t.Optional(t.Numeric({ minimum: 0, maximum: 4 })),
				brawlsMandatory: t.Optional(t.Boolean()),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.patch(
		'/recruiting',
		({ store, body }) =>
			clanService.updateRecruiting(store.clanId!, body.recruiting),
		{
			beforeHandle: [requireAuth, requireClanLeader],
			body: t.Object({ recruiting: t.Boolean() }),
			detail: { tags: ['Clan'] },
		}
	)
