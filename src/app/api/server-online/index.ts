import { t } from 'elysia'
import { createElysia } from '@/utils/elysia'
import { serverOnlineService } from './server-online.service'

export const serverOnlineRoutes = createElysia().group(
	'/server-online',
	(app) =>
		app
			.get('', async () => serverOnlineService.latest(), {
				detail: { tags: ['Server Online'] },
			})
			.get(
				'/history',
				async ({ query }) =>
					serverOnlineService.history(query.hours ?? 24),
				{
					query: t.Object({
						hours: t.Optional(t.Numeric()),
					}),
					detail: { tags: ['Server Online'] },
				}
			)
)
