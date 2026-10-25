import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { healthService } from './health.service'

export const healthRoutes = createElysia().group('/health', (app) =>
	app.use(jwtPlugin).get(
		'',
		{
			beforeHandle: [requireAuth, requireAdmin],
			detail: { tags: ['Admin'], summary: 'System health snapshot' },
		},
		async () => healthService.snapshot()
	)
)
