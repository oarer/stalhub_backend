import { t } from 'elysia'
import { getUnoPlayerProfile } from '@/app/api/uno/profile'
import { Regions } from '@/types/api.type'
import { PlayerRole } from '@/types/player.type'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { deferStartup } from '@/utils/startup'
import { playerService } from './player.service'

const UNO_ENRICH_TIMEOUT_MS = 5_000

export const playersRoute = createElysia()
	.onStart(() => {
		deferStartup(() => {
			playerService
				.init()
				.catch((err) =>
					console.error('[Player] Failed to initialize:', err)
				)
		})
	})
	.group('/player', (app) =>
		app
			.use(jwtPlugin)
			.get(
				'/popular',
				{
					query: t.Object({
						limit: t.Optional(t.Numeric()),
					}),
					detail: {
						tags: ['Player'],
					},
				},
				async ({ query }) => {
					const limit = query.limit ? Number(query.limit) : 10
					return playerService.getPopularPlayers(limit)
				}
			)

			.get(
				'/recent',
				{
					detail: {
						tags: ['Player'],
					},
				},
				async () => {
					return playerService.getRecentPlayers()
				}
			)

			.get(
				'/blacklist',
				{
					detail: {
						tags: ['Player'],
					},
				},
				async () => {
					return playerService.getBlacklist()
				}
			)

			.post(
				'/blacklist',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						uuid: t.String({}),
					}),
					detail: {
						tags: ['Player'],
					},
				},
				async ({ body: { uuid } }) => {
					return playerService.addToBlacklist(uuid)
				}
			)

			.delete(
				'/blacklist',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						uuid: t.String({}),
					}),
					detail: {
						tags: ['Player'],
					},
				},
				async ({ body: { uuid } }) => {
					return playerService.removeFromBlacklist(uuid)
				}
			)

			.post(
				'',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						uuid: t.String({}),
						description: t.String({}),
						role: t.Enum(PlayerRole, {}),
					}),
					detail: {
						tags: ['Player'],
					},
				},
				async ({ body, set }) => {
					return playerService.create({
						uuid: body.uuid,
						description: body.description,
						role: body.role,
					})
				}
			)

			.patch(
				'',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						uuid: t.String({}),
						description: t.Optional(t.String()),
						role: t.Optional(t.Enum(PlayerRole)),
					}),
					detail: {
						tags: ['Player'],
					},
				},
				async ({ body, set }) => {
					const result = await playerService.patch(body)
					return result
				}
			)

			.get(
				'/:region/operations/sessions',
				{
					params: t.Object({
						region: t.Enum(Regions),
					}),
					query: t.Object({
						username: t.Optional(t.String()),
						limit: t.Optional(
							t.Numeric({ minimum: 0, maximum: 100 })
						),
						offset: t.Optional(t.Numeric({ minimum: 0 })),
					}),
					detail: {
						tags: ['Player'],
					},
				},
				async ({ params, query }) => {
					return playerService.getOperations(params.region, {
						username: query.username,
						limit: query.limit ? Number(query.limit) : undefined,
						offset: query.offset ? Number(query.offset) : undefined,
					})
				}
			)

			.get(
				'/:region/:character',
				{
					params: t.Object({
						region: t.Enum(Regions),
						character: t.String(),
					}),
					query: t.Object({
						history: t.Optional(t.Boolean()),
						gear: t.Optional(t.Boolean()),
						strings: t.Optional(t.Boolean()),
					}),
					detail: {
						tags: ['Player'],
					},
				},
				async ({ params, query }) => {
					const profile = await playerService.get({
						region: params.region,
						character: params.character,
					})
					const clan_history = await playerService.getClanHistory({
						player_name: profile.username,
					})
					const base = { ...profile, clan_history }

					if (!query.gear && !query.strings) return base

					try {
						const controller = new AbortController()
						let timeout: ReturnType<typeof setTimeout> | undefined
						const timedOut = new Promise<never>((_, reject) => {
							timeout = setTimeout(() => {
								controller.abort()
								reject(new Error('UNO enrichment timeout'))
							}, UNO_ENRICH_TIMEOUT_MS)
						})
						try {
							const uno = await Promise.race([
								getUnoPlayerProfile(
									params.character,
									controller.signal
								),
								timedOut,
							])
							return {
								...base,
								...(query.gear ? { gear: uno.gear } : {}),
								...(query.strings
									? { strings: uno.strings }
									: {}),
							}
						} finally {
							clearTimeout(timeout)
						}
					} catch {
						return {
							...base,
							...(query.gear ? { gear: null } : {}),
							...(query.strings ? { strings: [] } : {}),
						}
					}
				}
			)

			.get(
				'/all',
				{
					query: t.Object({
						role: t.Enum(PlayerRole, {}),
					}),
					detail: {
						tags: ['Player'],
					},
				},
				async ({ query }) => {
					const role = query.role as PlayerRole | undefined
					return playerService.list(role)
				}
			)
	)
