import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanOfficer } from '../guards'
import { notesService } from '../services/notes'

export const notesRoutes = clanContext.group('/notes', (app) =>
	app
		.get(
			'',
			({ store }) => notesService.listAll(store.clanId!),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				detail: { tags: ['Clan Notes'] },
			}
		)
		.post(
			'',
			({ store, body }) =>
				notesService.upsert(store.clanId!, store.authUserId!, body.memberId, body.content),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				body: t.Object({
					memberId: t.Numeric(),
					content: t.String({ maxLength: 512 }),
				}),
				detail: { tags: ['Clan Notes'] },
			}
		)
		.patch(
			'/:noteId',
			({ params, body }) =>
				notesService.update(params.noteId, body.content),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: t.Object({ noteId: t.Numeric() }),
				body: t.Object({ content: t.String({ maxLength: 512 }) }),
				detail: { tags: ['Clan Notes'] },
			}
		)
		.delete(
			'/:noteId',
			({ params }) => notesService.delete(params.noteId),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: t.Object({ noteId: t.Numeric() }),
				detail: { tags: ['Clan Notes'] },
			}
		)
)
