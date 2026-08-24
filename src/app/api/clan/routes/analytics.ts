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
		.post(
			'/sessions',
			({ body, store }) =>
				analyticsService.createSession({
					creator_id: store.authUserId!,
					region: body.region,
					map_name: body.map_name,
					type: body.type,
					started_at: body.started_at,
					stage_number: body.stage_number,
					clan_id: store.clan_id,
				}),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				body: t.Object({
					region: t.Enum(Regions),
					map_name: t.String(),
					type: t.Optional(t.Enum(StageType)),
					started_at: t.Optional(t.String()),
					stage_number: t.Optional(t.Nullable(t.Numeric({ minimum: 1 }))),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.post(
			'/sessions/:id/screenshots',
			async ({ params, body, store, set }) => {
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())
				try {
					return await analyticsService.addScreenshot(params.id, store.clan_id!, {
						name: file.name,
						type: file.type,
						buffer: buf,
					})
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				body: t.Object({
					file: t.File({
						type: ['image/png', 'image/jpeg', 'image/webp'],
					}),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.post(
			'/screenshots/:id/retry',
			({ params, store }) =>
				analyticsService.retryAnalysis(params.id, store.clan_id!),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/stats',
			({ store, query }) =>
				analyticsService.getRawStats(
					store.clan_id ?? query.clan_id ?? ''
				),
			{
				beforeHandle: [requireAuth],
				query: t.Object({ clan_id: t.Optional(t.String()) }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/attendance-summary/:clan_id',
			({ params, query }) =>
				analyticsService.attendanceSummary(
					params.clan_id,
					query.type,
					query.from
				),
			{
				beforeHandle: [requireAuth],
				params: t.Object({ clan_id: t.String() }),
				query: t.Object({
					type: t.Optional(t.Enum(StageType)),
					from: t.Optional(t.String()),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/attendance',
			({ store, query }) =>
				analyticsService.attendanceMonth(store.clan_id!, query.month),
			{
				beforeHandle: [requireAuth, requireClanMember],
				query: t.Object({
					month: t.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/sessions/:id',
			({ params }) => analyticsService.getSession(params.id),
			{
				beforeHandle: [requireAuth],
				params: idParams,
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/sessions',
			({ store, query }) =>
				analyticsService.listSessions(store.authUserId!, query.clan_id),
			{
				beforeHandle: [requireAuth],
				query: t.Object({ clan_id: t.Optional(t.String()) }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.post(
			'/sessions/:id/attendance',
			({ params, body }) =>
				analyticsService.setManualAttendance(
					params.id,
					body.user_id,
					body.status,
					body.note
				),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				body: t.Object({
					user_id: t.Numeric(),
					status: t.Enum(AttendanceStatus),
					note: t.Optional(t.String()),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.delete(
			'/sessions/:id',
			({ params, store }) =>
				analyticsService.deleteSession(
					params.id,
					store.clan_id,
					store.authUserId
				),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/grenades/:region/:character',
			({ params }) =>
				grenadesService.getForCharacter(
					params.region,
					params.character
				),
			{
				beforeHandle: [requireAuth],
				params: t.Object({
					region: t.String(),
					character: t.String(),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/grenades/clan/:clan_id/stages',
			({ params }) => grenadesService.getForClanStages(params.clan_id),
			{
				beforeHandle: [requireAuth],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/grenades/clan/:clan_id/all-time',
			({ params }) => grenadesService.getAllTime(params.clan_id),
			{
				beforeHandle: [requireAuth],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/grenades/clan/:clan_id/boxes',
			({ params }) => grenadesService.getBoxes(params.clan_id),
			{
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.post(
			'/grenades/clan/:clan_id/boxes',
			({ params, body }) =>
				grenadesService.addBox(params.clan_id, {
					name: body.name,
					type: body.type,
					count: body.count,
				}),
			{
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clan_id: t.String() }),
				body: t.Object({
					name: t.String(),
					type: t.String(),
					count: t.Numeric({ minimum: 1 }),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.delete(
			'/grenades/clan/:clan_id/boxes',
			({ params, query }) =>
				grenadesService.removeBox(params.clan_id, Number(query.index)),
			{
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clan_id: t.String() }),
				query: t.Object({
					index: t.Numeric(),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
)
