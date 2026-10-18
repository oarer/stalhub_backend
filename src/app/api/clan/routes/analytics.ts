import { t } from 'elysia'
import { AttendanceStatus, StageType } from 'generated/prisma/enums'
import { Regions } from '@/types/api.type'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanMember, requireClanOfficer } from '../guards'
import { analyticsService } from '../services/analytics'
import { grenadesService } from '../services/grenades'

const idParams = t.Object({ id: t.Numeric() })

export const analyticsRoutes = clanContext.group('/analytics', (app) =>
	app
		.post('/sessions', {
				beforeHandle: [requireAuth, requireClanOfficer],
				body: t.Object({
					region: t.Enum(Regions),
					map_name: t.String(),
					type: t.Optional(t.Enum(StageType)),
					started_at: t.Optional(t.String()),
					stage_number: t.Optional(
						t.Nullable(t.Numeric({ minimum: 1 }))
					),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, ({ body, store }) =>
				analyticsService.createSession({
					creator_id: store.authUserId!,
					region: body.region,
					map_name: body.map_name,
					type: body.type,
					started_at: body.started_at,
					stage_number: body.stage_number,
					clan_id: store.clan_id,
				}))
		.post('/sessions/:id/screenshots', {
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				body: t.Object({
					file: t.File({
						type: ['image/png', 'image/jpeg', 'image/webp'],
					}),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, async ({ params, body, store, set }) => {
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())
				try {
					return await analyticsService.addScreenshot(
						params.id,
						store.clan_id!,
						{
							name: file.name,
							type: file.type,
							buffer: buf,
						}
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			})
		.post('/screenshots/:id/retry', {
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				detail: { tags: ['Clan Analytics'] },
			}, ({ params, store }) =>
				analyticsService.retryAnalysis(params.id, store.clan_id!))
		.get('/screenshots/:id/mismatches', {
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				detail: { tags: ['Clan Analytics'] },
			}, ({ params, store }) =>
				analyticsService.findMismatches(params.id, store.clan_id!))
		.post('/screenshots/:id/mismatches/resolve', {
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				body: t.Object({
					detected_name: t.String(),
					member_id: t.Numeric(),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params, body, store }) =>
				analyticsService.resolveMismatch(
					params.id,
					store.clan_id!,
					body.detected_name,
					body.member_id
				))
		.get('/stats', {
				beforeHandle: [requireAuth],
				query: t.Object({ clan_id: t.Optional(t.String()) }),
				detail: { tags: ['Clan Analytics'] },
			}, ({ store, query }) =>
				analyticsService.getRawStats(
					store.clan_id ?? query.clan_id ?? ''
				))
		.get('/attendance-summary/:clan_id', {
				beforeHandle: [requireAuth],
				params: t.Object({ clan_id: t.String() }),
				query: t.Object({
					type: t.Optional(t.Enum(StageType)),
					from: t.Optional(t.String()),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params, query }) =>
				analyticsService.attendanceSummary(
					params.clan_id,
					query.type,
					query.from
				))
		.get('/attendance', {
				beforeHandle: [requireAuth, requireClanMember],
				query: t.Object({
					month: t.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, ({ store, query }) =>
				analyticsService.attendanceMonth(store.clan_id!, query.month))
		.get('/sessions/:id', {
				beforeHandle: [requireAuth],
				params: idParams,
				detail: { tags: ['Clan Analytics'] },
			}, ({ params }) => analyticsService.getSession(params.id))
		.get('/sessions', {
				beforeHandle: [requireAuth],
				query: t.Object({ clan_id: t.Optional(t.String()) }),
				detail: { tags: ['Clan Analytics'] },
			}, ({ store, query }) =>
				analyticsService.listSessions(store.authUserId!, query.clan_id))
		.post('/sessions/:id/attendance', {
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				body: t.Object({
					user_id: t.Numeric(),
					status: t.Enum(AttendanceStatus),
					note: t.Optional(t.String()),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params, body }) =>
				analyticsService.setManualAttendance(
					params.id,
					body.user_id,
					body.status,
					body.note
				))
		.delete('/sessions/:id', {
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				detail: { tags: ['Clan Analytics'] },
			}, ({ params, store }) =>
				analyticsService.deleteSession(
					params.id,
					store.clan_id,
					store.authUserId
				))
		.get('/grenades/:region/:character', {
				beforeHandle: [requireAuth],
				params: t.Object({
					region: t.String(),
					character: t.String(),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params }) =>
				grenadesService.getForCharacter(
					params.region,
					params.character
				))
		.get('/grenades/clan/:clan_id/stages', {
				beforeHandle: [requireAuth],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params }) => grenadesService.getForClanStages(params.clan_id))
		.get('/grenades/clan/:clan_id/all-time', {
				beforeHandle: [requireAuth],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params }) => grenadesService.getAllTime(params.clan_id))
		.get('/grenades/clan/:clan_id/boxes', {
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params }) => grenadesService.getBoxes(params.clan_id))
		.post('/grenades/clan/:clan_id/boxes', {
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clan_id: t.String() }),
				body: t.Object({
					name: t.String(),
					type: t.String(),
					count: t.Numeric({ minimum: 1 }),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params, body }) =>
				grenadesService.addBox(params.clan_id, {
					name: body.name,
					type: body.type,
					count: body.count,
				}))
		.delete('/grenades/clan/:clan_id/boxes', {
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clan_id: t.String() }),
				query: t.Object({
					index: t.Numeric(),
				}),
				detail: { tags: ['Clan Analytics'] },
			}, ({ params, query }) =>
				grenadesService.removeBox(params.clan_id, Number(query.index)))
)
