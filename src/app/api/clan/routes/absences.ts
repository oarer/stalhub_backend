import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanMember } from '../guards'
import { absenceService } from '../services/absence'

export const absencesRoutes = clanContext
	.get(
		'/absences/:clanId',
		({ params, query }) =>
			absenceService.listForDate(params.clanId, query.date),
		{
			beforeHandle: [requireAuth],
			params: t.Object({ clanId: t.String() }),
			query: t.Object({ date: t.String({ format: 'date' }) }),
			detail: { tags: ['Clan'] },
		}
	)
	.get(
		'/absences/:clanId/range',
		({ params, query }) =>
			absenceService.listRange(params.clanId, query.from, query.to),
		{
			beforeHandle: [requireAuth],
			params: t.Object({ clanId: t.String() }),
			query: t.Object({
				from: t.String({ format: 'date' }),
				to: t.String({ format: 'date' }),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.put(
		'/absences',
		({ body, store }) =>
			absenceService.upsert(
				store.authUserId!,
				store.clanId!,
				body.date,
				body.events,
				body.note
			),
		{
			beforeHandle: [requireAuth, requireClanMember],
			body: t.Object({
				date: t.String({ format: 'date' }),
				events: t.Array(
					t.Object({
						eventType: t.Enum({
							TOURNAMENT: 'TOURNAMENT',
							BRAWL: 'BRAWL',
							BASE_CAPTURE: 'BASE_CAPTURE',
							GOLD_DROP: 'GOLD_DROP',
						} as const),
						stages: t.Optional(
							t.Array(t.Numeric({ minimum: 1, maximum: 4 }))
						),
					}),
					{ minItems: 1 }
				),
				note: t.Optional(t.Nullable(t.String())),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.delete(
		'/absences/:date',
		({ params, store }) =>
			absenceService.remove(
				store.authUserId!,
				store.clanId!,
				params.date
			),
		{
			beforeHandle: [requireAuth, requireClanMember],
			params: t.Object({ date: t.String({ format: 'date' }) }),
			detail: { tags: ['Clan'] },
		}
	)
