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
	.as('plugin')
	.group('/personal', (app) =>
		app
			.use(jwtPlugin)
			// tracked character
			.get(
				'/me',
				{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } },
				({ store }) => personalService.getMy(store.authUserId!)
			)
			.post(
				'/link',
				{
					beforeHandle: [requireAuth],
					body: t.Object({
						region: t.Enum(Regions),
						character: t.String({ minLength: 1 }),
					}),
					detail: { tags: ['Personal'] },
				},
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
				}
			)
			.delete(
				'/me',
				{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } },
				({ store }) => personalService.unlink(store.authUserId!)
			)
			.patch(
				'/visibility',
				{
					beforeHandle: [requireAuth],
					body: t.Object({
						is_public: t.Boolean(),
						public_fields: t.Optional(t.Array(t.String())),
					}),
					detail: { tags: ['Personal'] },
				},
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
				}
			)
			.post(
				'/snapshot',
				{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } },
				async ({ store, set }) => {
					try {
						return await personalService.takeSnapshot(
							store.authUserId!
						)
					} catch (err) {
						set.status = 400
						return { error: (err as Error).message }
					}
				}
			)
			.get(
				'/snapshots',
				{
					beforeHandle: [requireAuth],
					query: t.Object({
						from: t.Optional(t.String()),
						to: t.Optional(t.String()),
						limit: t.Optional(
							t.Numeric({ minimum: 1, maximum: 2000 })
						),
					}),
					detail: { tags: ['Personal'] },
				},
				({ store, query }) =>
					personalService.getSnapshots(store.authUserId!, {
						from: query.from,
						to: query.to,
						limit: query.limit,
					})
			)
			.get(
				'/summary',
				{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } },
				({ store }) => personalService.getSummary(store.authUserId!)
			)
			// personal stage analysis (этапы для персонажа)
			.post(
				'/sessions',
				{
					beforeHandle: [requireAuth],
					body: t.Object({
						region: t.String(),
						map_name: t.String(),
						type: t.Optional(t.Enum(StageType)),
						stage_number: t.Optional(
							t.Nullable(t.Numeric({ minimum: 1 }))
						),
						started_at: t.Optional(t.String()),
					}),
					detail: { tags: ['Personal'] },
				},
				async ({ body, store, set }) => {
					try {
						return await personalService.createSession(
							store.authUserId!,
							{
								region: body.region,
								map_name: body.map_name,
								type: body.type,
								stage_number: body.stage_number ?? null,
								started_at: body.started_at,
							}
						)
					} catch (err) {
						set.status = 400
						return { error: (err as Error).message }
					}
				}
			)
			.get(
				'/sessions',
				{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } },
				({ store }) => personalService.listSessions(store.authUserId!)
			)
			.get(
				'/sessions/:id',
				{
					beforeHandle: [requireAuth],
					params: idParams,
					detail: { tags: ['Personal'] },
				},
				async ({ params, store, set }) => {
					try {
						return await personalService.getSession(
							store.authUserId!,
							params.id
						)
					} catch (err) {
						set.status = 404
						return { error: (err as Error).message }
					}
				}
			)
			.post(
				'/sessions/:id/screenshots',
				{
					beforeHandle: [requireAuth],
					params: idParams,
					body: t.Object({
						file: t.File(),
					}),
					detail: { tags: ['Personal'] },
				},
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
				}
			)
			.post(
				'/screenshots/:id/retry',
				{
					beforeHandle: [requireAuth],
					params: idParams,
					detail: { tags: ['Personal'] },
				},
				({ params, store }) =>
					personalService.retryAnalysis(store.authUserId!, params.id)
			)
			.delete(
				'/sessions/:id',
				{
					beforeHandle: [requireAuth],
					params: idParams,
					detail: { tags: ['Personal'] },
				},
				({ params, store }) =>
					personalService.deleteSession(store.authUserId!, params.id)
			)
			.get(
				'/stage-stats',
				{ beforeHandle: [requireAuth], detail: { tags: ['Personal'] } },
				({ store }) =>
					personalService.getMyStageStats(store.authUserId!)
			)
			// public
			.get(
				'/public/:username',
				{
					params: t.Object({ username: t.String() }),
					detail: { tags: ['Personal'] },
				},
				async ({ params, set }) => {
					const data = await personalService.getPublic(
						params.username
					)
					if (!data) {
						set.status = 404
						return { error: 'Not public or not found' }
					}
					return data
				}
			)
	)
