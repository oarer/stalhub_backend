import { t } from 'elysia'
import { ZodError } from 'zod'
import {
	type AuthContext,
	requireAuth as authenticate,
	fromStore,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { arbitration } from './arbitration'
import { artists } from './artists'
import { files } from './files'
import { orders } from './orders'
import { CommissionError } from './policy'
import {
	caseCommandSchema,
	commandSchema,
	createSchema,
	profileSchema,
} from './schemas'

async function requireAuth(context: AuthContext) {
	context.store = { ...context.store }
	return authenticate(context)
}

const params = t.Object({
	id: t.String({ minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' }),
})
const pageQuery = t.Object({
	page: t.Optional(t.Numeric({ minimum: 1, maximum: 10000, multipleOf: 1 })),
})
async function respond<T>(
	set: { status?: number | string },
	run: () => Promise<T>
) {
	try {
		const value = await run()
		return value === null ? Response.json(null) : value
	} catch (error) {
		if (error instanceof CommissionError) {
			set.status = error.status
			return { error: error.code }
		}
		if (error instanceof ZodError) {
			set.status = 400
			return { error: 'INVALID_INPUT' }
		}
		console.error(
			'[commissions]',
			(error as { code?: string })?.code ?? 'UNEXPECTED_ERROR'
		)
		set.status = 500
		return { error: 'COMMISSION_ERROR' }
	}
}

export const commissionsRoutes = createElysia().group('/commissions', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'/artists',
			{
				query: t.Object({
					...pageQuery.properties,
					search: t.Optional(t.String({ maxLength: 100 })),
				}),
			},
			({ query, set }) =>
				respond(set, () =>
					artists.list(query.page ?? 1, query.search ?? '')
				)
		)
		.get('/artists/:id', { params }, ({ params, set }) =>
			respond(set, () => artists.get(params.id))
		)
		.group('', (privateApp) =>
			privateApp
				.onBeforeHandle([
					({ set }) => {
						set.headers['Cache-Control'] = 'private, no-store'
					},
					requireAuth,
				])
				.get('/capabilities', ({ store, set }) =>
					respond(set, () =>
						arbitration.capabilities(fromStore(store).user_id)
					)
				)
				.get('/profile', ({ store, set }) =>
					respond(set, () => artists.mine(fromStore(store).user_id))
				)
				.put(
					'/profile',
					{ body: t.Unknown() },
					({ store, body, set }) =>
						respond(set, () =>
							artists.save(
								fromStore(store).user_id,
								profileSchema.parse(body)
							)
						)
				)
				.post(
					'/files',
					{ body: t.Object({ file: t.File({ maxSize: '20m' }) }) },
					({ store, body, set }) =>
						respond(set, () =>
							files.upload(fromStore(store).user_id, body.file)
						)
				)
				.get('/files/:id', { params }, ({ store, params, set }) =>
					respond(set, () =>
						files.download(fromStore(store).user_id, params.id)
					)
				)
				.delete('/files/:id', { params }, ({ store, params, set }) =>
					respond(set, () =>
						files.remove(fromStore(store).user_id, params.id)
					)
				)
				.get(
					'/orders',
					{
						query: t.Object({
							...pageQuery.properties,
							side: t.Optional(
								t.Union([
									t.Literal('customer'),
									t.Literal('artist'),
								])
							),
							status: t.Optional(t.String({ maxLength: 30 })),
						}),
					},
					({ store, query, set }) =>
						respond(set, () =>
							orders.list(
								fromStore(store).user_id,
								query.side ?? 'customer',
								query.page ?? 1,
								query.status
							)
						)
				)
				.post(
					'/orders',
					{ body: t.Unknown() },
					({ store, body, set }) =>
						respond(set, () =>
							orders.create(
								fromStore(store).user_id,
								createSchema.parse(body)
							)
						)
				)
				.get('/orders/:id', { params }, ({ store, params, set }) =>
					respond(set, () =>
						orders.detail(fromStore(store).user_id, params.id)
					)
				)
				.post(
					'/orders/:id/actions',
					{ params, body: t.Unknown() },
					({ store, params, body, set }) =>
						respond(set, () =>
							orders.command(
								fromStore(store).user_id,
								params.id,
								commandSchema.parse(body)
							)
						)
				)
				.get(
					'/orders/:id/messages',
					{
						params,
						query: t.Object({
							after: t.Optional(t.Numeric({ minimum: 0 })),
							before: t.Optional(t.Numeric({ minimum: 0 })),
						}),
					},
					({ store, params, query, set }) =>
						respond(set, () =>
							orders.messages(
								fromStore(store).user_id,
								params.id,
								query.after ?? 0,
								query.before ?? 0
							)
						)
				)
				.post(
					'/orders/:id/read',
					{
						params,
						body: t.Object({ through: t.Integer({ minimum: 1 }) }),
					},
					({ store, params, body, set }) =>
						respond(set, () =>
							orders.read(
								fromStore(store).user_id,
								params.id,
								body.through
							)
						)
				)
				.get(
					'/reputation/:id',
					{ params, query: pageQuery },
					({ store, params, query, set }) =>
						respond(set, () =>
							arbitration.reputation(
								fromStore(store).user_id,
								Number(params.id),
								query.page ?? 1
							)
						)
				)
				.get('/cases', { query: pageQuery }, ({ store, query, set }) =>
					respond(set, () =>
						arbitration.list(
							fromStore(store).user_id,
							query.page ?? 1
						)
					)
				)
				.get('/cases/:id', { params }, ({ store, params, set }) =>
					respond(set, () =>
						arbitration.detail(fromStore(store).user_id, params.id)
					)
				)
				.post(
					'/cases/:id/actions',
					{ params, body: t.Unknown() },
					({ store, params, body, set }) =>
						respond(set, () =>
							arbitration.command(
								fromStore(store).user_id,
								params.id,
								caseCommandSchema.parse(body)
							)
						)
				)
		)
)
