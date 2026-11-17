import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import {
	FeedCategoryDuplicateError,
	FeedCategoryNotFoundError,
	feedCategoriesService,
} from './service'

const categoryBody = t.Object({
	name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
	enabled: t.Optional(t.Boolean()),
	position: t.Optional(t.Numeric()),
	source_ids: t.Optional(t.Array(t.Numeric(), { maxItems: 500 })),
})

export const feedCategoriesRoutes = createElysia().group(
	'/feed-categories',
	(app) =>
		app
			.use(jwtPlugin)
			.get(
				'/',
				{
					beforeHandle: [requireAuth, requireAdmin],
					detail: { tags: ['Admin'] },
				},
				async () => ({
					categories: await feedCategoriesService.list(),
				})
			)
			.post(
				'/',
				{
					beforeHandle: [requireAuth, requireAdmin],
					body: t.Composite(
						categoryBody,
						t.Object({
							name: t.String({
								minLength: 1,
								maxLength: 100,
							}),
						})
					),
					detail: { tags: ['Admin'] },
				},
				async ({ body, set }) => {
					try {
						return {
							category: await feedCategoriesService.create(body),
						}
					} catch (error) {
						if (error instanceof FeedCategoryDuplicateError) {
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
					body: categoryBody,
					detail: { tags: ['Admin'] },
				},
				async ({ params, body, set }) => {
					try {
						return {
							category: await feedCategoriesService.update(
								Number(params.id),
								body
							),
						}
					} catch (error) {
						if (error instanceof FeedCategoryNotFoundError) {
							set.status = 404
							return { error: error.message }
						}
						if (error instanceof FeedCategoryDuplicateError) {
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
						await feedCategoriesService.delete(Number(params.id))
						return { ok: true }
					} catch (error) {
						if (error instanceof FeedCategoryNotFoundError) {
							set.status = 404
							return { error: error.message }
						}
						throw error
					}
				}
			)
)
