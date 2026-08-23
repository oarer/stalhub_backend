import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanOfficer } from '../guards'
import { notesService } from '../services/notes'

export const notesRoutes = clanContext.group('/notes', (app) =>
	app
		.get(
			'',
			({ store }) => notesService.listAll(store.clan_id!),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				detail: { tags: ['Clan Notes'] },
			}
		)
		.post(
			'',
			({ store, body }) =>
				notesService.upsert(store.clan_id!, store.authUserId!, body.member_id, body.content),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				body: t.Object({
					member_id: t.Numeric(),
					content: t.String({ maxLength: 512 }),
				}),
				detail: { tags: ['Clan Notes'] },
			}
		)
		.patch(
			'/:note_id',
			({ params, body }) =>
				notesService.update(params.note_id, body.content),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: t.Object({ note_id: t.Numeric() }),
				body: t.Object({ content: t.String({ maxLength: 512 }) }),
				detail: { tags: ['Clan Notes'] },
			}
		)
		.delete(
			'/:note_id',
			({ params }) => notesService.delete(params.note_id),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: t.Object({ note_id: t.Numeric() }),
				detail: { tags: ['Clan Notes'] },
			}
		)
)
