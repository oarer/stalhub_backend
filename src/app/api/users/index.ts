import { t } from 'elysia'
import {
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { usersService } from './users.service'

const cookieSchema = t.Cookie({
	refresh_token: t.Optional(t.String()),
	access_token: t.Optional(t.String()),
})

async function requireRefreshAuth({
	cookie: { refresh_token },
	jwt,
	set,
	store,
}: any) {
	const payload = await jwt.verify(refresh_token?.value)
	if (
		!payload ||
		typeof payload.sub !== 'string' ||
		typeof payload.sid !== 'string'
	) {
		set.status = 401
		return { error: 'Unauthorized' }
	}
	store.authUserId = payload.sub
	store.authSessionId = payload.sid
}

export const usersRoutes = createElysia().group('/users', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'/@me',
			async ({ store }) => {
				return usersService.getMe(fromStore(store).sessionId)
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Users'] },
			}
		)

		.patch(
			'/@me',
			async ({ body, store, set }) => {
				const result = await usersService.updateSettings(
					fromStore(store).userId,
					body
				)
				if ('error' in result) {
					set.status = 400
					return result
				}
				return result
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					public_profile: t.Optional(t.Boolean()),
					avatar: t.Optional(t.String()),
				}),
				detail: { tags: ['Users'] },
			}
		)

		.delete(
			'/@me',
			async ({ cookie: { refresh_token, access_token }, store }) => {
				await usersService.revokeSession(fromStore(store).sessionId)
				refresh_token?.remove()
				access_token?.remove()
				return { success: true }
			},
			{
				beforeHandle: [requireRefreshAuth],
				cookie: cookieSchema,
				detail: { tags: ['Users'] },
			}
		)

		.delete(
			'/@me/delete',
			async ({ cookie: { refresh_token, access_token }, store }) => {
				const { userId, sessionId } = fromStore(store)
				await usersService.revokeSession(sessionId)
				await usersService.deleteAccount(userId)
				refresh_token?.remove()
				access_token?.remove()
				return { success: true }
			},
			{
				beforeHandle: [requireRefreshAuth],
				cookie: cookieSchema,
				detail: { tags: ['Users'] },
			}
		)

		.get(
			'/@me/sessions',
			async ({ store }) => {
				const { userId, sessionId } = fromStore(store)
				return usersService.getSessions(userId, sessionId)
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Users'] },
			}
		)

		.delete(
			'/@me/sessions/all',
			async ({ cookie: { refresh_token, access_token }, store }) => {
				const { userId, sessionId } = fromStore(store)
				await usersService.revokeAllSessions(userId, sessionId)
				refresh_token?.remove()
				access_token?.remove()
				return { success: true }
			},
			{
				beforeHandle: [requireRefreshAuth],
				cookie: cookieSchema,
				detail: { tags: ['Users'] },
			}
		)

		.delete(
			'/@me/sessions/:id',
			async ({ params, store }) => {
				await usersService.revokeSessionById(
					params.id,
					fromStore(store).userId
				)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Users'] },
			}
		)

		.get(
			'/@me/settings',
			async ({ store, set }) => {
				const data = await usersService.getSettings(
					fromStore(store).userId
				)
				if (!data) {
					set.status = 404
					return { error: 'User not found' }
				}
				return data
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Users'] },
			}
		)

		.get(
			'/@me/stars',
			async ({ store, query }) => {
				const take = query.take ?? 24
				const page = query.page ?? 0
				return usersService.getStars(
					fromStore(store).userId,
					take,
					page
				)
			},
			{
				beforeHandle: [requireAuth],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Users'] },
			}
		)

		.get(
			'/@me/notifications',
			async ({ store, query }) => {
				const take = query.take ?? 5
				const page = query.page ?? 0
				return usersService.getNotifications(
					fromStore(store).userId,
					take,
					page
				)
			},
			{
				beforeHandle: [requireAuth],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Users'] },
			}
		)

		.get(
			'/:username',
			async ({ params, store, set }) => {
				const data = await usersService.getPublicProfile(
					params.username,
					fromStoreOpt(store).userId
				)
				if (!data) {
					set.status = 404
					return { error: 'User not found' }
				}
				return data
			},
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ username: t.String() }),
				detail: { tags: ['Users'] },
			}
		)
)
