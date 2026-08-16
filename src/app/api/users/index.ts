import { t } from 'elysia'
import {
	AvatarSource,
	BannerMode,
	BannerType,
	CardBackground,
	UserLayout,
} from 'generated/prisma/enums'
import { Regions } from '@/types/api.type'
import {
	fromStore,
	requireAuth,
	requireOptionalAuth,
	requireRefreshAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { buildsService } from '@/app/api/builds/builds.service'
import { avatarRoutes } from './avatar'
import { usersService } from './users.service'

/*
	HUGE thanks to AndcoolSystems (GitHub: @Andcool-Systems) for the API reference <3
*/

const cookieSchema = t.Cookie({
	refresh_token: t.Optional(t.String()),
	access_token: t.Optional(t.String()),
})

export const usersRoutes = createElysia().group('/users', (app) =>
	app
		.use(jwtPlugin)
		.use(avatarRoutes)
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
				const { name, username, social_links, ...settingsData } = body
				const userId = fromStore(store).userId

				if (name !== undefined || username !== undefined) {
					const result = await usersService.updateProfile(userId, {
						name,
						username,
					})
					if ('error' in result) {
						set.status = 400
						return result
					}
				}

				if (social_links !== undefined) {
					const result = await usersService.updateSocialLinks(
						userId,
						social_links
					)
					if ('error' in result) {
						set.status = 400
						return result
					}
				}

				if (Object.keys(settingsData).length > 0) {
					const result = await usersService.updateSettings(
						userId,
						settingsData
					)
					if ('error' in result) {
						set.status = 400
						return result
					}
				}

				return usersService.getMe(fromStore(store).sessionId)
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					public_profile: t.Optional(t.Boolean()),
					layout: t.Optional(t.Enum(UserLayout)),
					avatar: t.Optional(t.Enum(AvatarSource)),
					region: t.Optional(t.Enum(Regions)),

					bannerMode: t.Optional(t.Enum(BannerMode)),
					bannerType: t.Optional(t.Enum(BannerType)),
					bannerColor: t.Optional(t.String()),
					bannerImage: t.Optional(t.String()),

					cardBackground: t.Optional(t.Enum(CardBackground)),
					cardColor: t.Optional(t.String()),

					social_links: t.Optional(t.Record(t.String(), t.String())),

					name: t.Optional(t.String({ minLength: 1 })),
					username: t.Optional(
						t.String({
							minLength: 3,
							maxLength: 32,
							pattern: '^[a-zA-Z0-9_]+$',
						})
					),
				}),
				detail: { tags: ['Users'] },
			}
		)

		.post(
			'/@me/onboarding',
			async ({ body, store, set }) => {
				const result = await usersService.completeOnboarding(
					fromStore(store).userId,
					body
				)
				if ('error' in result) {
					set.status = 400
					return result
				}

				return usersService.getMe(fromStore(store).sessionId)
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					name: t.Optional(t.String({ minLength: 1 })),
					username: t.Optional(
						t.String({
							minLength: 3,
							maxLength: 32,
							pattern: '^[a-zA-Z0-9_]+$',
						})
					),
					region: t.Optional(t.Enum(Regions)),
					layout: t.Optional(t.Enum(UserLayout)),
					avatar: t.Optional(t.Enum(AvatarSource)),

					bannerMode: t.Optional(t.Enum(BannerMode)),
					bannerType: t.Optional(t.Enum(BannerType)),
					bannerColor: t.Optional(t.String()),
					bannerImage: t.Optional(t.String()),

					cardBackground: t.Optional(t.Enum(CardBackground)),
					cardColor: t.Optional(t.String()),
				}),
				detail: { tags: ['Users'] },
			}
		)

		// logout
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
			'/@me/builds',
			async ({ store, query }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
				return buildsService.list(take, page, {
					authorId: fromStore(store).userId,
				})
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
			'/@me/stars',
			async ({ store, query }) => {
				const take = query.take ?? 24
				const page = (query.page ?? 1) - 1
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
			'/@me/notifications/unread',
			async ({ store }) => {
				return usersService.getUnreadCount(fromStore(store).userId)
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Users'] },
			}
		)

		.patch(
			'/@me/notifications/:id/read',
			async ({ params, store, set }) => {
				const ok = await usersService.markRead(
					fromStore(store).userId,
					Number(params.id)
				)
				if (!ok) {
					set.status = 404
					return { error: 'Notification not found' }
				}
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Users'] },
			}
		)

		.post(
			'/@me/notifications/read-all',
			async ({ store }) => {
				await usersService.markAllRead(fromStore(store).userId)
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Users'] },
			}
		)

		.delete(
			'/@me/notifications/:id',
			async ({ params, store, set }) => {
				const ok = await usersService.deleteNotification(
					fromStore(store).userId,
					Number(params.id)
				)
				if (!ok) {
					set.status = 404
					return { error: 'Notification not found' }
				}
				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Users'] },
			}
		)

		.get(
			'/id/:id',
			async ({ params, set }) => {
				const data = await usersService.getPublicProfileById(params.id)
				if (!data) {
					set.status = 404
					return { error: 'User not found' }
				}
				return data
			},
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Users'] },
			}
		)

		.get(
			'/:username',
			async ({ params, set }) => {
				const data = await usersService.getPublicProfile(
					params.username
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

		.post(
			'/@me/banner',
			async ({ body, store, set }) => {
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())

				try {
					return await usersService.saveBanner(
						fromStore(store).userId,
						{
							name: file.name,
							type: file.type,
							buffer: buf,
						}
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					file: t.File({
						type: ['image/png', 'image/jpeg', 'image/webp'],
					}),
				}),
				detail: { tags: ['Users'] },
			}
		)
)
