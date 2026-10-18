import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { scAdminService } from './sc-admin.service'

export const scAdminRoutes = createElysia().group('/sc', (app) =>
	app
		.use(jwtPlugin)

		.get('/overview', {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		}, () => scAdminService.overview())

		.get('/nodes', {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		}, () => scAdminService.listNodes())
		.post('/nodes', {
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					name: t.String({ minLength: 1 }),
					base_url: t.String({ minLength: 1 }),
					api_key: t.Optional(t.String()),
					priority: t.Optional(t.Numeric()),
					timeout_ms: t.Optional(t.Numeric()),
					enabled: t.Optional(t.Boolean()),
				}),
				detail: { tags: ['Admin'] },
			}, async ({ body, set }) => {
				try {
					return await scAdminService.createNode(body)
				} catch (err) {
					if ((err as Error).message.startsWith('Invalid base_url')) {
						set.status = 400
						return { error: 'Invalid base_url' }
					}
					set.status = 409
					return { error: 'Node with this name already exists' }
				}
			})
		.patch('/nodes/:id', {
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				body: t.Object({
					name: t.Optional(t.String({ minLength: 1 })),
					base_url: t.Optional(t.String({ minLength: 1 })),
					api_key: t.Optional(t.String()),
					priority: t.Optional(t.Numeric()),
					timeout_ms: t.Optional(t.Numeric()),
					enabled: t.Optional(t.Boolean()),
				}),
				detail: { tags: ['Admin'] },
			}, async ({ params, body, set }) => {
				try {
					return await scAdminService.updateNode(
						Number(params.id),
						body
					)
				} catch (err) {
					if ((err as Error).message.startsWith('Invalid base_url')) {
						set.status = 400
						return { error: 'Invalid base_url' }
					}
					set.status = 404
					return { error: 'Node not found' }
				}
			})
		.delete('/nodes/:id', {
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}, async ({ params, set }) => {
				try {
					return await scAdminService.deleteNode(Number(params.id))
				} catch {
					set.status = 404
					return { error: 'Node not found' }
				}
			})
		.post('/nodes/:id/ping', {
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}, async ({ params, set }) => {
				const result = await scAdminService.pingNode(Number(params.id))
				if (!result) {
					set.status = 404
					return { error: 'Node not found' }
				}
				return result
			})

		.get('/tokens', {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		}, () => scAdminService.listTokens())
		.post('/tokens', {
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					label: t.Optional(t.String()),
					token: t.String({ minLength: 1 }),
				}),
				detail: { tags: ['Admin'] },
			}, async ({ body, set }) => {
				const result = await scAdminService.createToken(body)
				if ('error' in result) {
					set.status = 409
				}
				return result
			})
		.post('/tokens/bulk', {
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					tokens: t.Union([t.String(), t.Array(t.String())]),
					label: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}, async ({ body }) => scAdminService.bulkTokens(body))
		.patch('/tokens/:id', {
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				body: t.Object({
					label: t.Optional(t.String()),
					enabled: t.Optional(t.Boolean()),
				}),
				detail: { tags: ['Admin'] },
			}, async ({ params, body, set }) => {
				try {
					return await scAdminService.updateToken(
						Number(params.id),
						body
					)
				} catch {
					set.status = 404
					return { error: 'Token not found' }
				}
			})
		.delete('/tokens/:id', {
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}, async ({ params, set }) => {
				try {
					return await scAdminService.deleteToken(Number(params.id))
				} catch {
					set.status = 404
					return { error: 'Token not found' }
				}
			})
)
