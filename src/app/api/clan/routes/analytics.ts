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
					creatorId: store.authUserId!,
					region: body.region,
					map_name: body.map_name,
					type: body.type,
					started_at: body.started_at,
					clanId: store.clanId,
				}),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				body: t.Object({
					region: t.Enum(Regions),
					map_name: t.String(),
					type: t.Optional(t.Enum(StageType)),
					started_at: t.Optional(t.String()),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.post(
			'/sessions/:id/screenshots',
			async ({ params, body, set }) => {
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())
				try {
					return await analyticsService.addScreenshot(params.id, {
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
			({ params }) => analyticsService.retryAnalysis(params.id),
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
					store.clanId ?? query.clanId ?? ''
				),
			{
				beforeHandle: [requireAuth],
				query: t.Object({ clanId: t.Optional(t.String()) }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/attendance-summary/:clanId',
			({ params, query }) =>
				analyticsService.attendanceSummary(
					params.clanId,
					query.type,
					query.from
				),
			{
				beforeHandle: [requireAuth],
				params: t.Object({ clanId: t.String() }),
				query: t.Object({
					type: t.Optional(t.Enum(StageType)),
					from: t.Optional(t.String()),
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
				analyticsService.listSessions(store.authUserId!, query.clanId),
			{
				beforeHandle: [requireAuth],
				query: t.Object({ clanId: t.Optional(t.String()) }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.post(
			'/sessions/:id/attendance',
			({ params, body }) =>
				analyticsService.setManualAttendance(
					params.id,
					body.userId,
					body.status,
					body.note
				),
			{
				beforeHandle: [requireAuth, requireClanOfficer],
				params: idParams,
				body: t.Object({
					userId: t.Numeric(),
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
					store.clanId,
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
			'/grenades/clan/:clanId/stages',
			({ params }) => grenadesService.getForClanStages(params.clanId),
			{
				beforeHandle: [requireAuth],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/grenades/clan/:clanId/all-time',
			({ params }) => grenadesService.getAllTime(params.clanId),
			{
				beforeHandle: [requireAuth],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.get(
			'/grenades/clan/:clanId/boxes',
			({ params, query }) =>
				grenadesService.getBoxes(params.clanId, query.date),
			{
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clanId: t.String() }),
				query: t.Object({ date: t.String() }),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.post(
			'/grenades/clan/:clanId/boxes',
			({ params, body }) =>
				grenadesService.addBox(params.clanId, {
					name: body.name,
					type: body.type,
					count: body.count,
					date: body.date,
				}),
			{
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clanId: t.String() }),
				body: t.Object({
					name: t.String(),
					type: t.String(),
					count: t.Numeric({ minimum: 1 }),
					date: t.String(),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
		.delete(
			'/grenades/clan/:clanId/boxes',
			({ params, query }) =>
				grenadesService.removeBox(
					params.clanId,
					query.date,
					Number(query.index)
				),
			{
				beforeHandle: [requireAuth, requireClanMember],
				params: t.Object({ clanId: t.String() }),
				query: t.Object({
					date: t.String(),
					index: t.Numeric(),
				}),
				detail: { tags: ['Clan Analytics'] },
			}
		)
)
