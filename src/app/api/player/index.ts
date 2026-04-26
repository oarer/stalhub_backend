import { t } from 'elysia'
import { env } from '@/env'
import { Regions } from '@/types/api.type'
import { PlayerRole } from '@/types/player.type'
import { createElysia } from '@/utils/elysia'
import { playerService } from './player.service'

export const playersRoute = createElysia().group('/player', (app) =>
	app
		.get(
			'/:region/:character',
			async ({ params }) => {
				return playerService.get({
					region: params.region,
					character: params.character,
				})
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
		//! TODO пиздец костыли, но после авторизации нормально сделаю
		.post(
			'',
			async ({ body: { uuid, description, role } }) => {
				return playerService.create({ uuid, description, role })
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
			}
		)

		.patch(
			'',
			async ({ body: { uuid, description, role } }) => {
				return playerService.patch({ uuid, description, role })
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
					description: t.Optional(t.String()),
					role: t.Optional(
						t.Enum(PlayerRole, {
							error: 'Property role is missing',
						})
					),
				}),
				detail: {
					tags: ['Player'],
				},
			}
		)

		.delete(
			'',
			async ({ body: { uuid } }) => {
				return playerService.delete(uuid)
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
)
