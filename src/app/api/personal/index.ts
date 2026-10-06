import { t } from 'elysia'
import { StageType } from 'generated/prisma/enums'
import { Regions } from '@/types/api.type'
import { requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { personalService } from './service'

const idParams = t.Object({ id: t.Numeric() })

export const personalRoutes = createElysia()
	.state('authUserId', undefined as number | undefined)
	.as('scoped')
	.group('/personal', (app) =>
	app
		.use(jwtPlugin)
		// tracked character
		.get(
			'/me',
			({ store }) => personalService.getMy(store.authUserId!),
			{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } }
		)
		.post(
			'/link',
			async ({ body, store, set }) => {
				try {
					return await personalService.link(
						store.authUserId!,
						body.region,
						body.character
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					region: t.Enum(Regions),
					character: t.String({ minLength: 1 }),
				}),
				detail: { tags: ['Personal'] },
			}
		)
		.delete(
			'/me',
			({ store }) => personalService.unlink(store.authUserId!),
			{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } }
		)
		.patch(
			'/visibility',
			async ({ body, store, set }) => {
				try {
					return await personalService.setVisibility(
						store.authUserId!,
						body.is_public,
						body.public_fields
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					is_public: t.Boolean(),
					public_fields: t.Optional(t.Array(t.String())),
				}),
				detail: { tags: ['Personal'] },
			}
		)
		.post(
			'/snapshot',
			async ({ store, set }) => {
				try {
					return await personalService.takeSnapshot(store.authUserId!)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } }
		)
		.get(
			'/snapshots',
			({ store, query }) =>
				personalService.getSnapshots(store.authUserId!, {
					from: query.from,
					to: query.to,
					limit: query.limit,
				}),
			{
				beforeHandle: [requireAuth],
				query: t.Object({
					from: t.Optional(t.String()),
					to: t.Optional(t.String()),
					limit: t.Optional(t.Numeric({ minimum: 1, maximum: 2000 })),
				}),
				detail: { tags: ['Personal'] },
			}
		)
		.get(
			'/summary',
			({ store }) => personalService.getSummary(store.authUserId!),
			{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } }
		)
		// personal stage analysis (этапы для персонажа)
		.post(
			'/sessions',
			async ({ body, store, set }) => {
				try {
					return await personalService.createSession(store.authUserId!, {
						region: body.region,
						map_name: body.map_name,
						type: body.type,
						stage_number: body.stage_number ?? null,
						started_at: body.started_at,
					})
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					region: t.String(),
					map_name: t.String(),
					type: t.Optional(t.Enum(StageType)),
					stage_number: t.Optional(t.Nullable(t.Numeric({ minimum: 1 }))),
					started_at: t.Optional(t.String()),
				}),
				detail: { tags: ['Personal'] },
			}
		)
		.get(
			'/sessions',
			({ store }) => personalService.listSessions(store.authUserId!),
			{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } }
		)
		.get(
			'/sessions/:id',
			async ({ params, store, set }) => {
				try {
					return await personalService.getSession(store.authUserId!, params.id)
				} catch (err) {
					set.status = 404
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				params: idParams,
				detail: { tags: ['Personal'] },
			}
		)
		.post(
			'/sessions/:id/screenshots',
			async ({ params, body, store, set }) => {
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())
				try {
					return await personalService.addScreenshot(
						store.authUserId!,
						params.id,
						{ name: file.name, type: file.type, buffer: buf }
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				params: idParams,
				body: t.Object({
					file: t.File({
						type: ['image/png', 'image/jpeg', 'image/webp'],
					}),
				}),
				detail: { tags: ['Personal'] },
			}
		)
		.post(
			'/screenshots/:id/retry',
			({ params, store }) =>
				personalService.retryAnalysis(store.authUserId!, params.id),
			{
				beforeHandle: [requireAuth],
				params: idParams,
				detail: { tags: ['Personal'] },
			}
		)
		.delete(
			'/sessions/:id',
			({ params, store }) =>
				personalService.deleteSession(store.authUserId!, params.id),
			{
				beforeHandle: [requireAuth],
				params: idParams,
				detail: { tags: ['Personal'] },
			}
		)
		.get(
			'/stage-stats',
			({ store }) => personalService.getMyStageStats(store.authUserId!),
			{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } }
		)
		// public
		.get(
			'/public/:username',
			async ({ params, set }) => {
				const data = await personalService.getPublic(params.username)
				if (!data) {
					set.status = 404
					return { error: 'Not public or not found' }
				}
				return data
			},
			{
				params: t.Object({ username: t.String() }),
				detail: { tags: ['Personal'] },
			}
		)
)
