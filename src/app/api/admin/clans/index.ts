import { t } from 'elysia'

import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { adminClanService } from './clans.service'

export const clansRoutes = createElysia().group('/clans', (app) =>
	app
		.use(jwtPlugin)
		.get('/seasons', () => adminClanService.listSeasons(), {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		})
		.post(
			'/seasons',
			async ({ body, set }) => {
				try {
					return await adminClanService.createSeason(body)
				} catch (error) {
					set.status = 400
					return { error: (error as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({ name: t.String(), starts_at: t.String(), ends_at: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)
		.put(
			'/seasons/:season_id',
			async ({ params, body, set }) => {
				try {
					return await adminClanService.updateSeason(params.season_id, body)
				} catch (error) {
					set.status = 400
					return { error: (error as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ season_id: t.Numeric() }),
				body: t.Object({ name: t.String(), starts_at: t.String(), ends_at: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)
		.delete(
			'/seasons/:season_id',
			({ params }) => adminClanService.removeSeason(params.season_id),
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ season_id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)
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
			'/:clan_id',
			async ({ params, set }) => {
				const result = await adminClanService.get(params.clan_id)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:clan_id/members',
			async ({ params }) => {
				return adminClanService.getMembers(params.clan_id)
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/:clan_id',
			async ({ params, body, set }) => {
				const result = await adminClanService.update(
					params.clan_id,
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
				params: t.Object({ clan_id: t.String() }),
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
							brawls_per_week: t.Optional(
								t.Numeric({ minimum: 0, maximum: 4 })
							),
							brawls_mandatory: t.Optional(t.Boolean()),
							sunday_activity: t.Optional(
								t.Enum({
									BASE_CAPTURE: 'BASE_CAPTURE',
									BRAWL: 'BRAWL',
									NONE: 'NONE',
								})
							),
						})
					),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:clan_id/block',
			async ({ params, body, set }) => {
				const result = await adminClanService.block(
					params.clan_id,
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
				params: t.Object({ clan_id: t.String() }),
				body: t.Object({
					reason: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:clan_id/block',
			async ({ params, set }) => {
				const result = await adminClanService.unblock(params.clan_id)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.delete(
			'/:clan_id',
			async ({ params, set }) => {
				const ok = await adminClanService.remove(params.clan_id)
				if (!ok) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return { success: true }
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.post(
			'/:clan_id/sync',
			async ({ params, set }) => {
				const result = await adminClanService.sync(params.clan_id)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.get(
			'/:clan_id/sessions',
			async ({ params, set }) => {
				const result = await adminClanService.listSessions(
					params.clan_id
				)
				if (!result) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ clan_id: t.String() }),
				detail: { tags: ['Admin'] },
			}
		)

		.patch(
			'/sessions/:session_id',
			async ({ params, body, set }) => {
				const result = await adminClanService.updateSession(
					params.session_id,
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
				params: t.Object({ session_id: t.Numeric() }),
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
			'/sessions/:session_id',
			async ({ params, set }) => {
				const result = await adminClanService.removeSession(
					params.session_id
				)
				if (!result) {
					set.status = 404
					return { error: 'Session not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ session_id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)
)
