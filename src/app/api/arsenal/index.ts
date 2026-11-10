import { cron } from '@elysia/cron'
import { createElysia } from '@/utils/elysia'
import { deferStartup } from '@/utils/startup'
import { getCache, shouldRevalidate } from './cache'
import { updatePrices } from './utils'

export const routeArsenal = createElysia()
	.use(
		cron({
			name: 'arsenal-update',
			pattern: '0 0,12 * * *',
			timezone: 'Europe/Moscow',
			run: updatePrices,
		})
	)
	.onStart(() => {
		deferStartup(() => {
			getCache()
				.then((cached) => {
					if (!cached || shouldRevalidate(cached.updated_at)) {
						return updatePrices()
					}
				})
				.catch((err) =>
					console.error('[Arsenal] Failed to update on start:', err)
				)
		})
	})
	.get(
		'/arsenal',
		async ({ set }: { set: { headers: Record<string, string> } }) => {
			set.headers['Cache-Control'] =
				'public, max-age=300, stale-while-revalidate=600'
			const cached = await getCache()

			if (!cached) {
				await updatePrices()
				const fresh = await getCache()

				return {
					updated_at: fresh?.updated_at,
					total: fresh?.items.length ?? 0,
					items: fresh?.items ?? [],
				}
			}

			if (shouldRevalidate(cached.updated_at)) {
				updatePrices()
			}

			return {
				updated_at: cached.updated_at,
				total: cached.items.length,
				items: cached.items,
			}
		}
	)
