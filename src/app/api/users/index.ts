import { t } from 'elysia'
import {
	AvatarSource,
	BannerMode,
	BannerType,
	CardBackground,
	UserLayout,
} from 'generated/prisma/enums'
import { buildsService } from '@/app/api/builds/builds.service'
import { Regions } from '@/types/api.type'
import {
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
	requireRefreshAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
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
				return usersService.getMe(fromStore(store).session_id)
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
				const user_id = fromStore(store).user_id

				if (name !== undefined || username !== undefined) {
					const result = await usersService.updateProfile(user_id, {
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
						user_id,
						social_links
					)
					if ('error' in result) {
						set.status = 400
						return result
					}
				}

				if (Object.keys(settingsData).length > 0) {
					const result = await usersService.updateSettings(
						user_id,
						settingsData
					)
					if ('error' in result) {
						set.status = 400
						return result
					}
				}

				return usersService.getMe(fromStore(store).session_id)
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					public_profile: t.Optional(t.Boolean()),
					layout: t.Optional(t.Enum(UserLayout)),
					avatar: t.Optional(t.Enum(AvatarSource)),
					region: t.Optional(t.Enum(Regions)),

					banner_mode: t.Optional(t.Enum(BannerMode)),
					banner_type: t.Optional(t.Enum(BannerType)),
					banner_color: t.Optional(t.String()),
					banner_image: t.Optional(t.String()),

					card_background: t.Optional(t.Enum(CardBackground)),
					card_color: t.Optional(t.String()),

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
					fromStore(store).user_id,
					body
				)
				if ('error' in result) {
					set.status = 400
					return result
				}

				return usersService.getMe(fromStore(store).session_id)
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

					banner_mode: t.Optional(t.Enum(BannerMode)),
					banner_type: t.Optional(t.Enum(BannerType)),
					banner_color: t.Optional(t.String()),
					banner_image: t.Optional(t.String()),

					card_background: t.Optional(t.Enum(CardBackground)),
					card_color: t.Optional(t.String()),
				}),
				detail: { tags: ['Users'] },
			}
		)

		// logout
		.delete(
			'/@me',
			async ({ cookie: { refresh_token, access_token }, store }) => {
				await usersService.revokeSession(fromStore(store).session_id)
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

		.post(
			'/@me/sync-clans',
			async ({ store, set }) => {
				const result = await usersService.syncClans(
					fromStore(store).user_id
				)
				if ('error' in result) {
					set.status = 400
					return result
				}
				return result
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Users'] },
			}
		)

		.delete(
			'/@me/delete',
			async ({ cookie: { refresh_token, access_token }, store }) => {
				const { user_id, session_id } = fromStore(store)
				await usersService.revokeSession(session_id)
				await usersService.deleteAccount(user_id)
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
				const { user_id, session_id } = fromStore(store)
				return usersService.getSessions(user_id, session_id)
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Users'] },
			}
		)

		.delete(
			'/@me/sessions/all',
			async ({ cookie: { refresh_token, access_token }, store }) => {
				const { user_id, session_id } = fromStore(store)
				await usersService.revokeAllSessions(user_id, session_id)
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
					fromStore(store).user_id
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
					fromStore(store).user_id
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
					author_id: fromStore(store).user_id,
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
					fromStore(store).user_id,
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
					fromStore(store).user_id,
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
				return usersService.getUnreadCount(fromStore(store).user_id)
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
					fromStore(store).user_id,
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
				await usersService.markAllRead(fromStore(store).user_id)
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
					fromStore(store).user_id,
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
			async ({ params, store, set }) => {
				const data = await usersService.getPublicProfileById(
					params.id,
					fromStoreOpt(store).user_id
				)
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
			async ({ params, store, set }) => {
				const data = await usersService.getPublicProfile(
					params.username,
					fromStoreOpt(store).user_id
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
						fromStore(store).user_id,
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

		.post(
			'/@me/avatar',
			async ({ body, store, set }) => {
				const file = body.file
				const buf = Buffer.from(await file.arrayBuffer())
				
				try {
					return await usersService.saveAvatar(
						fromStore(store).user_id,
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

		.delete(
			'/@me/avatar',
			async ({ store, set }) => {
				try {
					return await usersService.clearAvatar(
						fromStore(store).user_id
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Users'] },
			}
		)
)
