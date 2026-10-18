import { t } from 'elysia'
import { Regions } from '@/types/api.type'
import { PlayerRole } from '@/types/player.type'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { playerService } from './player.service'

export const playersRoute = createElysia()
	.setup(async () => {
		await playerService.init()
	})
	.group('/player', (app) =>
		app.use(jwtPlugin)
			.get('/popular', {
					query: t.Object({
						limit: t.Optional(t.Numeric()),
					}),
					detail: {
						tags: ['Player'],
					},
				}, async ({ query }) => {
					const limit = query.limit ? Number(query.limit) : 10
					return playerService.getPopularPlayers(limit)
				})

			.get('/recent', {
					detail: {
						tags: ['Player'],
					},
				}, async () => {
					return playerService.getRecentPlayers()
				})

			.get('/blacklist', {
					detail: {
						tags: ['Player'],
					},
				}, async () => {
					return playerService.getBlacklist()
				})

			.post('/blacklist', {
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						uuid: t.String({ error: 'Property uuid is missing' }),
					}),
					detail: {
						tags: ['Player'],
					},
				}, async ({ body: { uuid } }) => {
					return playerService.addToBlacklist(uuid)
				})

			.delete('/blacklist', {
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						uuid: t.String({ error: 'Property uuid is missing' }),
					}),
					detail: {
						tags: ['Player'],
					},
				}, async ({ body: { uuid } }) => {
					return playerService.removeFromBlacklist(uuid)
				})

			.post('', {
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						uuid: t.String({ error: 'Property uuid is missing' }),
						description: t.String({
							error: 'Property description is missing',
						}),
						role: t.Enum(PlayerRole, {
							error: 'Property role is missing',
						}),
					}),
					detail: {
						tags: ['Player'],
					},
				}, async ({ body, set }) => {
					return playerService.create({
						uuid: body.uuid,
						description: body.description,
						role: body.role,
					})
				})

			.patch('', {
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Object({
						uuid: t.String({ error: 'Property uuid is missing' }),
						description: t.Optional(t.String()),
						role: t.Optional(t.Enum(PlayerRole)),
					}),
					detail: {
						tags: ['Player'],
					},
				}, async ({ body, set }) => {
					const result = await playerService.patch(body)
					return result
				})

			.get('/:region/operations/sessions', {
					params: t.Object({
						region: t.Enum(Regions),
					}),
					query: t.Object({
						username: t.Optional(t.String()),
						limit: t.Optional(t.Numeric({ minimum: 0, maximum: 100 })),
						offset: t.Optional(t.Numeric({ minimum: 0 })),
					}),
					detail: {
						tags: ['Player'],
					},
				}, async ({ params, query }) => {
					return playerService.getOperations(params.region, {
						username: query.username,
						limit: query.limit ? Number(query.limit) : undefined,
						offset: query.offset ? Number(query.offset) : undefined,
					})
				})

			.get('/:region/:character', {
					params: t.Object({
						region: t.Enum(Regions),
						character: t.String(),
					}),
					detail: {
						tags: ['Player'],
					},
				}, async ({ params }) => {
					const profile = await playerService.get({
						region: params.region,
						character: params.character,
					})
					const clan_history = await playerService.getClanHistory({
						player_name: profile.username,
					})
					return { ...profile, clan_history }
				})

			.get('/all', {
					query: t.Object({
						role: t.Enum(PlayerRole, {
							error: 'Property role is missing',
						}),
					}),
					detail: {
						tags: ['Player'],
					},
				}, async ({ query }) => {
					const role = query.role as PlayerRole | undefined
					return playerService.list(role)
				})
	)
