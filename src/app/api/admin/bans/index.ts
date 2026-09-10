import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { abuseStats, listBans } from './bans.service'

export const bansRoutes = createElysia().group('/bans', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			async ({ query }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				return listBans({
					auto: query.auto,
					rule: query.rule,
					search: query.search,
					take,
					page,
				})
			},
			{
				beforeHandle: [requireAuth, requireAdmin],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					auto: t.Optional(t.Boolean()),
					rule: t.Optional(t.String()),
					search: t.Optional(t.String()),
				}),
				detail: { tags: ['Admin'] },
			}
		)
		.get(
			'/stats',
			async () => abuseStats(),
			{
				beforeHandle: [requireAuth, requireAdmin],
				detail: { tags: ['Admin'] },
			}
		)
)