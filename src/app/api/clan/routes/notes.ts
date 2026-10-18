import { t } from 'elysia'
import { requireAuth } from '@/utils/auth.guard'
import { rejectOnXss } from '@/utils/xss-guard'
import { clanContext } from '../context'
import { requireClanOfficer } from '../guards'
import { notesService } from '../services/notes'

export const notesRoutes = clanContext.group('/notes', (app) =>
	app
		.get('', {
				beforeHandle: [requireAuth, requireClanOfficer],
				detail: { tags: ['Clan Notes'] },
			}, ({ store }) => notesService.listAll(store.clan_id!))
		.post('', {
				beforeHandle: [requireAuth, requireClanOfficer],
				body: t.Object({
					member_id: t.Numeric(),
					content: t.String({ maxLength: 512 }),
				}),
				detail: { tags: ['Clan Notes'] },
			}, async ({ store, body, set, request }) => {
				const xss = await rejectOnXss({
					fields: { content: body.content },
					user_id: store.authUserId as number | undefined,
					ip:
						request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
						request.headers.get('x-real-ip') ??
						'?',
					route: 'POST /clan/notes',
				})
				if (xss) {
					set.status = 400
					return { error: 'Invalid content' }
				}
				return notesService.upsert(store.clan_id!, store.authUserId!, body.member_id, body.content)
			})
		.patch('/:note_id', {
				beforeHandle: [requireAuth, requireClanOfficer],
				params: t.Object({ note_id: t.Numeric() }),
				body: t.Object({ content: t.String({ maxLength: 512 }) }),
				detail: { tags: ['Clan Notes'] },
			}, async ({ params, body, store, set, request }) => {
				const xss = await rejectOnXss({
					fields: { content: body.content },
					user_id: store.authUserId as number | undefined,
					ip:
						request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
						request.headers.get('x-real-ip') ??
						'?',
					route: 'PATCH /clan/notes/:note_id',
				})
				if (xss) {
					set.status = 400
					return { error: 'Invalid content' }
				}
				return notesService.update(params.note_id, body.content)
			})
		.delete('/:note_id', {
				beforeHandle: [requireAuth, requireClanOfficer],
				params: t.Object({ note_id: t.Numeric() }),
				detail: { tags: ['Clan Notes'] },
			}, ({ params }) => notesService.delete(params.note_id))
)
