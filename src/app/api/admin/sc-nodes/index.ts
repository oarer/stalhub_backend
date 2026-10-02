import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { scAdminService } from './sc-admin.service'

export const scAdminRoutes = createElysia().group('/sc', (app) =>
	app
		.use(jwtPlugin)
		// ---------- overview ----------
		.get('/overview', () => scAdminService.overview(), {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		})
		// ---------- nodes ----------
		.get('/nodes', () => scAdminService.listNodes(), {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		})
		.post(
			'/nodes',
			async ({ body, set }) => {
				try {
					return await scAdminService.createNode(body)
				} catch {
					set.status = 409
					return { error: 'Node with this name already exists' }
				}
			},
			{
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
			}
		)
		.patch(
			'/nodes/:id',
			async ({ params, body, set }) => {
				try {
					return await scAdminService.updateNode(
						Number(params.id),
						body
					)
				} catch {
					set.status = 404
					return { error: 'Node not found' }
				}
			},
			{
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
			}
		)
		.delete(
			'/nodes/:id',
			async ({ params, set }) => {
				try {
					return await scAdminService.deleteNode(Number(params.id))
				} catch {
					set.status = 404
					return { error: 'Node not found' }
				}
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)
		.post(
			'/nodes/:id/ping',
			async ({ params, set }) => {
				const result = await scAdminService.pingNode(Number(params.id))
				if (!result) {
					set.status = 404
					return { error: 'Node not found' }
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)
		// ---------- tokens ----------
		.get('/tokens', () => scAdminService.listTokens(), {
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'] },
		})
		.post(
			'/tokens',
			async ({ body, set }) => {
				const result = await scAdminService.createToken(body)
				if ('error' in result) {
					set.status = 409
				}
				return result
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					label: t.Optional(t.String()),
					token: t.String({ minLength: 1 }),
				}),
				detail: { tags: ['Admin'] },
			}
		)
		.post(
			'/tokens/bulk',
			async ({ body }) => scAdminService.bulkTokens(body),
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					tokens: t.Union([t.String(), t.Array(t.String())]),
					label: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)
		.patch(
			'/tokens/:id',
			async ({ params, body, set }) => {
				try {
					return await scAdminService.updateToken(
						Number(params.id),
						body
					)
				} catch {
					set.status = 404
					return { error: 'Token not found' }
				}
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				body: t.Object({
					label: t.Optional(t.String()),
					enabled: t.Optional(t.Boolean()),
				}),
				detail: { tags: ['Admin'] },
			}
		)
		.delete(
			'/tokens/:id',
			async ({ params, set }) => {
				try {
					return await scAdminService.deleteToken(Number(params.id))
				} catch {
					set.status = 404
					return { error: 'Token not found' }
				}
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			}
		)
)
