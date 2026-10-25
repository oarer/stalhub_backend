import { logAdminAction } from '@/lib/admin-audit'
import { prisma } from '@/lib/prisma'
import { createElysia } from '@/utils/elysia'
import { adminArtsRoutes } from './arts'
import { auditRoutes } from './audit'
import { badgesRoutes } from './badges'
import { bansRoutes } from './bans'
import { clansRoutes } from './clans'
import { dashboardRoutes } from './dashboard'
import { healthRoutes } from './health'
import { moderationRoutes } from './moderation'
import { notificationsRoutes } from './notifications'
import { permissionsRoutes } from './permissions'
import { rolesRoutes } from './roles'
import { scAdminRoutes } from './sc-nodes'
import { usersRoutes } from './users'

const AUDIT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const nameCache = new Map<number, { name: string; expires: number }>()

async function actorUsername(user_id: number): Promise<string> {
	const cached = nameCache.get(user_id)
	if (cached && cached.expires > Date.now()) return cached.name

	const user = await prisma.user.findUnique({
		where: { id: user_id },
		select: { username: true },
	})
	const name = user?.username ?? ''
	nameCache.set(user_id, { name, expires: Date.now() + 60_000 })
	return name
}

export const adminRoutes = createElysia()
	.beforeHandle(async ({ request, store, body }) => {
		const safeStore = store as Record<string, unknown>
		if (!AUDIT_METHODS.has(request.method)) return
		if (typeof safeStore.authUserId !== 'number') return
		const contentType = request.headers.get('content-type') ?? ''
		if (!contentType.includes('application/json') || body === null) return

		try {
			const snapshot = typeof body === 'object' ? { ...body } : body
			const json = JSON.stringify(snapshot)

			safeStore.auditBody =
				json === undefined || json.length > 4096 ? null : snapshot
		} catch {
			safeStore.auditBody = null
		}
	})
	.afterHandle(async ({ request, store, set }) => {
		const safeStore = store as Record<string, unknown>
		if (!AUDIT_METHODS.has(request.method)) return
		if (typeof safeStore.authUserId !== 'number') return

		try {
			const url = new URL(request.url)
			const parts = url.pathname.split('/').filter(Boolean)
			const adminIdx = parts.indexOf('admin')
			if (adminIdx === -1) return

			const entity = parts[adminIdx + 1] ?? 'admin'
			const entity_id = parts[adminIdx + 2] ?? null

			const status = typeof set.status === 'number' ? set.status : 200
			const actorId = safeStore.authUserId as number

			await logAdminAction({
				actor_id: actorId,
				actor_name: await actorUsername(actorId),
				action: `${request.method} ${entity}`,
				entity,
				entity_id,
				meta: {
					status,
					path: url.pathname,
					body: (safeStore.auditBody as never) ?? undefined,
				},
			})
		} catch (err) {
			console.error('[Audit] Failed to record request:', err)
		}
	})
	.group('/admin', (app) =>
		app
			.use(dashboardRoutes)
			.use(healthRoutes)
			.use(auditRoutes)
			.use(moderationRoutes)
			.use(permissionsRoutes)
			.use(rolesRoutes)
			.use(usersRoutes)
			.use(badgesRoutes)
			.use(notificationsRoutes)
			.use(clansRoutes)
			.use(bansRoutes)
			.use(adminArtsRoutes)
			.use(scAdminRoutes)
	)
