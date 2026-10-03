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
			.get(
				'/peaks',
				async ({ query }) =>
					serverOnlineService.peaks(query.days ?? 30),
				{
					query: t.Object({
						days: t.Optional(t.Numeric()),
					}),
					detail: { tags: ['Server Online'] },
				}
			)
			.get(
				'/emissions',
				async ({ query, status }) => {
					try {
						return await serverOnlineService.emissions(
							query.region ?? 'RU'
						)
					} catch {
						return status(502, { error: 'Upstream unavailable' })
					}
				},
				{
					query: t.Object({
						region: t.Optional(t.String()),
					}),
					detail: { tags: ['Server Online'] },
				}
			)
)
