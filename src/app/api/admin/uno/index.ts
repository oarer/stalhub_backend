import { t } from 'elysia'
import { fromStore, requireAdmin, requireAuth } from '@/utils/auth.guard'
import { isValidIp } from '@/utils/auto-ban/uno'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import {
	banUnoIp,
	listUnoBans,
	listUnoIpStats,
	unbanUnoIp,
} from './uno.service'

const DEFAULT_TAKE = 50
const MAX_TAKE = 100
const DEFAULT_BAN_REASON = 'Ручная блокировка IP'

export const unoAdminRoutes = createElysia().group('/uno', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'/ip-stats',
			{
				beforeHandle: [requireAuth, requireAdmin],
				query: t.Object({
					take: t.Optional(t.Numeric()),
				}),
				detail: {
					tags: ['Admin'],
					summary: 'Per-IP request frequency to UNO API (24h)',
				},
			},
			async ({ query }) =>
				listUnoIpStats(
					Math.min(Math.max(query.take ?? DEFAULT_TAKE, 1), MAX_TAKE)
				)
		)
		.get(
			'/bans',
			{
				beforeHandle: [requireAuth, requireAdmin],
				detail: { tags: ['Admin'], summary: 'List manual UNO IP bans' },
			},
			async () => listUnoBans()
		)
		.post(
			'/bans',
			{
				beforeHandle: [requireAuth, requireAdmin],
				body: t.Object({
					ip: t.String({ maxLength: 45 }),
					reason: t.Optional(t.String({ maxLength: 200 })),
				}),
				detail: {
					tags: ['Admin'],
					summary: 'Manually ban IP from UNO API',
				},
			},
			async ({ body, store, set }) => {
				if (!isValidIp(body.ip)) {
					set.status = 422
					return { error: 'Invalid IP address' }
				}
				return banUnoIp(
					body.ip,
					body.reason?.trim() || DEFAULT_BAN_REASON,
					String(fromStore(store).user_id)
				)
			}
		)
		.delete(
			'/bans/:ip',
			{
				beforeHandle: [requireAuth, requireAdmin],
				params: t.Object({ ip: t.String({ maxLength: 45 }) }),
				detail: {
					tags: ['Admin'],
					summary: 'Remove manual UNO IP ban',
				},
			},
			async ({ params, set }) => {
				if (!isValidIp(params.ip)) {
					set.status = 422
					return { error: 'Invalid IP address' }
				}
				await unbanUnoIp(params.ip)
				return { ok: true }
			}
		)
)
