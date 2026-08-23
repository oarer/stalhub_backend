import { t } from 'elysia'
import { GoldDropStatus } from 'generated/prisma/enums'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanOfficer } from '../guards'
import { goldService } from '../services/gold'

const idParams = t.Object({ id: t.Numeric() })

export const goldRoutes = clanContext
	.get('/gold/:clan_id', ({ params }) => goldService.list(params.clan_id), {
		beforeHandle: [requireAuth],
		params: t.Object({ clan_id: t.String() }),
		detail: { tags: ['Clan'] },
	})
	.post(
		'/gold/:id/attendees',
		({ params, body, store }) =>
			goldService.setAttendees(params.id, store.clan_id!, body.member_ids),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({
				member_ids: t.Array(t.Numeric(), { minItems: 1 }),
			}),
			detail: { tags: ['Clan'] },
		}
	)
	.post(
		'/gold/:id/status',
		({ params, body, store }) =>
			goldService.setStatus(params.id, store.clan_id!, body.status),
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: idParams,
			body: t.Object({ status: t.Enum(GoldDropStatus) }),
			detail: { tags: ['Clan'] },
		}
	)
