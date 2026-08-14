import { t } from 'elysia'

import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { adminClanService } from './clans.service'

export const clansRoutes = createElysia().group('/clans', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			async ({ query }) => {
				const take = query.take ?? 20
				const page = (query.page ?? 1) - 1
				return adminClanService.list(take, page, query.search)
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					search: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:clanId',
			async ({ params, set }) => {
				const result = await adminClanService.get(params.clanId)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:clanId/members',
			async ({ params }) => {
				return adminClanService.getMembers(params.clanId)
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:clanId',
			async ({ params, body, set }) => {
				const result = await adminClanService.update(
					params.clanId,
					body
				)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clanId: t.String() }),
				body: t.Object({
					name: t.Optional(t.String()),
					tag: t.Optional(t.String()),
					description: t.Optional(t.String()),
					status: t.Optional(
						t.Enum({ FROZEN: 'FROZEN', ACTIVE: 'ACTIVE' })
					),
					is_public: t.Optional(t.Boolean()),
					recruiting: t.Optional(t.Boolean()),
					region: t.Optional(t.String()),
					schedule: t.Optional(
						t.Object({
							brawlsPerWeek: t.Optional(t.Numeric()),
							brawlsMandatory: t.Optional(t.Boolean()),
						})
					),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:clanId/block',
			async ({ params, body, set }) => {
				const result = await adminClanService.block(
					params.clanId,
					body.reason
				)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clanId: t.String() }),
				body: t.Object({
					reason: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:clanId/block',
			async ({ params, set }) => {
				const result = await adminClanService.unblock(params.clanId)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:clanId',
			async ({ params, set }) => {
				const ok = await adminClanService.remove(params.clanId)
				if (!ok) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:clanId/sync',
			async ({ params, set }) => {
				const result = await adminClanService.sync(params.clanId)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:clanId/sessions',
			async ({ params, set }) => {
				const result = await adminClanService.listSessions(
					params.clanId
				)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/sessions/:sessionId',
			async ({ params, body, set }) => {
				const result = await adminClanService.updateSession(
					params.sessionId,
					body
				)
				if (!result) {
					set.status = 404
					return { error: 'Session not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ sessionId: t.Numeric() }),
				body: t.Object({
					map_name: t.Optional(t.String()),
					type: t.Optional(
						t.Enum({
							TOURNAMENT: 'TOURNAMENT',
							BRAWL: 'BRAWL',
							BASE_CAPTURE: 'BASE_CAPTURE',
						})
					),
					stage_number: t.Optional(t.Nullable(t.Numeric())),
					started_at: t.Optional(t.Nullable(t.String())),
					ended_at: t.Optional(t.Nullable(t.String())),
					region: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/sessions/:sessionId',
			async ({ params, set }) => {
				const result = await adminClanService.removeSession(
					params.sessionId
				)
				if (!result) {
					set.status = 404
					return { error: 'Session not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ sessionId: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)
)
