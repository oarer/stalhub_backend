import { t } from 'elysia'
import { env } from '@/env'
import { Regions } from '@/types/api.type'
import { PlayerRole } from '@/types/player.type'
import { createElysia } from '@/utils/elysia'
import { playerService } from './player.service'

export const playersRoute = createElysia()
	.onStart(async () => {
		await playerService.init()
	})
	.group('/player', (app) =>
		app
			.get(
				'/popular',
				async ({ query }) => {
					const limit = query.limit ? Number(query.limit) : 10
					return playerService.getPopularPlayers(limit)
				},
				{
					query: t.Object({
						limit: t.Optional(t.Numeric()),
					}),
					detail: {
						tags: ['Player'],
					},
				}
			)

			.get(
				'/recent',
				async () => {
					return playerService.getRecentPlayers()
				},
				{
					detail: {
						tags: ['Player'],
					},
				}
			)

			.post(
				'/blacklist',
				async ({ body: { uuid } }) => {
					return playerService.addToBlacklist(uuid)
				},
				{
					beforeHandle: async ({ headers, set }) => {
						if (headers.authorization !== `Bearer ${env.TOKEN}`) {
							set.status = 401
							return { error: 'Unauthorized' }
						}
					},
					body: t.Object({
						uuid: t.String({ error: 'Property uuid is missing' }),
					}),
					detail: {
						tags: ['Player'],
					},
				}
			)

			.get(
				'/blacklist',
				async () => {
					return playerService.getBlacklist()
				},
				{
					detail: {
						tags: ['Player'],
					},
				}
			)

			.delete(
				'/blacklist',
				async ({ body: { uuid } }) => {
					return playerService.removeFromBlacklist(uuid)
				},
				{
					beforeHandle: async ({ headers, set }) => {
						if (headers.authorization !== `Bearer ${env.TOKEN}`) {
							set.status = 401
							return { error: 'Unauthorized' }
						}
					},
					body: t.Object({
						uuid: t.String({ error: 'Property uuid is missing' }),
					}),
					detail: {
						tags: ['Player'],
					},
				}
			)

			.get(
				'/:region/operations/sessions',
				async ({ params, query }) => {
					return playerService.getOperations(params.region, {
						username: query.username,
						limit: query.limit ? Number(query.limit) : undefined,
						offset: query.offset ? Number(query.offset) : undefined,
					})
				},
				{
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
				}
			)

			.get(
				'/:region/:character',
				async ({ params }) => {
					const profile = await playerService.get({
						region: params.region,
						character: params.character,
					})
					const clan_history = await playerService.getClanHistory({
						player_name: profile.username,
					})
					return { ...profile, clan_history }
				},
				{
					params: t.Object({
						region: t.Enum(Regions),
						character: t.String(),
					}),
					detail: {
						tags: ['Player'],
					},
				}
			)

			.get(
				'/all',
				async ({ query }) => {
					const role = query.role as PlayerRole | undefined
					return playerService.list(role)
				},
				{
					query: t.Object({
						role: t.Enum(PlayerRole, {
							error: 'Property role is missing',
						}),
					}),
					detail: {
						tags: ['Player'],
					},
				}
			)
	)
