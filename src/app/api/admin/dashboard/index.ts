import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { dashboardService } from './dashboard.service'

export const dashboardRoutes = createElysia().group('/dashboard', (app) =>
	app.use(jwtPlugin).get(
		'',
		{
			beforeHandle: [requireAuth, requireAdmin],
			query: t.Object({
				days: t.Optional(t.Numeric()),
			}),
			detail: {
				tags: ['Admin'],
				summary: 'Aggregated admin dashboard metrics',
			},
		},
		async ({ query }) => dashboardService.summary(query.days ?? 30)
	)
)
