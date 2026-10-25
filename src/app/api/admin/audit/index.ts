import { t } from 'elysia'
import { requireAdmin, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { auditService } from './audit.service'

export const auditRoutes = createElysia().group('/audit', (app) =>
	app.use(jwtPlugin).get(
		'',
		{
			beforeHandle: [requireAuth, requireAdmin],
			query: t.Object({
				take: t.Optional(t.Numeric()),
				page: t.Optional(t.Numeric()),
				search: t.Optional(t.String()),
				entity: t.Optional(t.String()),
				action: t.Optional(t.String()),
				actor_id: t.Optional(t.Numeric()),
			}),
			detail: { tags: ['Admin'], summary: 'Admin action audit log' },
		},
		async ({ query }) =>
			auditService.list({
				take: query.take ?? 24,
				page: Math.max((query.page ?? 1) - 1, 0),
				search: query.search,
				entity: query.entity,
				action: query.action,
				actor_id: query.actor_id,
			})
	)
)
