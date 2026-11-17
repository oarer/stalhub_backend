import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import {
	FeedSourceDuplicateError,
	FeedSourceNotFoundError,
	feedSourcesService,
} from './service'

const sourceType = t.Union([t.Literal('TG'), t.Literal('YOUTUBE')])

export const feedSourcesRoutes = createElysia().group('/feed-sources', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'/',
			{
				beforeHandle: [requireAuth, requireAdmin],
				detail: { tags: ['Admin'] },
			},
			async () => ({ sources: await feedSourcesService.list() })
		)
		.post(
			'/',
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					type: sourceType,
					external_id: t.String({ minLength: 1, maxLength: 200 }),
					label: t.Optional(t.String({ maxLength: 200 })),
				}),
				detail: { tags: ['Admin'] },
			},
			async ({ body, set }) => {
				try {
					return {
						source: await feedSourcesService.create(body),
					}
				} catch (error) {
					if (error instanceof FeedSourceDuplicateError) {
						set.status = 409
						return { error: error.message }
					}
					set.status = 400
					return { error: (error as Error).message }
				}
			}
		)
		.patch(
			'/:id',
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				body: t.Object({
					external_id: t.Optional(
						t.String({ minLength: 1, maxLength: 200 })
					),
					label: t.Optional(t.String({ maxLength: 200 })),
					enabled: t.Optional(t.Boolean()),
				}),
				detail: { tags: ['Admin'] },
			},
			async ({ params, body, set }) => {
				try {
					return {
						source: await feedSourcesService.update(
							Number(params.id),
							body
						),
					}
				} catch (error) {
					if (error instanceof FeedSourceNotFoundError) {
						set.status = 404
						return { error: error.message }
					}
					if (error instanceof FeedSourceDuplicateError) {
						set.status = 409
						return { error: error.message }
					}
					set.status = 400
					return { error: (error as Error).message }
				}
			}
		)
		.delete(
			'/:id',
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			},
			async ({ params, set }) => {
				try {
					await feedSourcesService.delete(Number(params.id))
					return { ok: true }
				} catch (error) {
					if (error instanceof FeedSourceNotFoundError) {
						set.status = 404
						return { error: error.message }
					}
					throw error
				}
			}
		)
		.post(
			'/:id/sync',
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Admin'] },
			},
			async ({ params, set }) => {
				const id = Number(params.id)
				const source = await feedSourcesService.get(id)
				if (!source) {
					set.status = 404
					return { error: 'Feed source not found' }
				}
				const result =
					source.type === 'TG'
						? await (
								await import('./telegram')
							).syncTelegramSources([id])
						: await (await import('./youtube')).syncYouTubeSources([
								id,
							])
				const updated = await feedSourcesService.get(id)
				return {
					synced: result.synced,
					last_synced_at: updated?.last_synced_at ?? null,
				}
			}
		)
)
