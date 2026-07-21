import { t } from 'elysia'
import { authService } from '@/utils/auth.service'
import { createElysia } from '@/utils/elysia'
import { accessCookie, jwtPlugin, refreshCookie } from '@/utils/jwt.plugin'
import { discordAuth } from './providers/discord'
import { exboAuth } from './providers/exbo'
import { telegramAuth } from './providers/telegram'

const cookieSchema = t.Cookie({
	refresh_token: t.String(),
	access_token: t.Optional(t.String()),
})

export const authRoutes = createElysia().group('/auth', (app) =>
	app
		.use(jwtPlugin)
		.use(discordAuth)
		.use(telegramAuth)
		.use(exboAuth)

		.post(
			'/refresh',
			async ({ cookie: { refresh_token, access_token }, jwt, set }) => {
				const payload = await jwt.verify(refresh_token.value)

			if (
				!payload ||
				typeof payload.sub !== 'string' ||
				typeof payload.sid !== 'string'
			) {
				refresh_token.remove()
				set.status = 401
				return { error: 'Invalid refresh token' }
			}

			const session = await authService.getSessionWithRoles(
				payload.sid
			)

			if (!session || session.revoked) {
				refresh_token.remove()
				set.status = 401
				return { error: 'Session revoked or expired' }
			}

			const roles = session.User.roles.map((r) => r.name)

			const accessToken = await jwt.sign({
				sub: payload.sub,
					sid: payload.sid,
					name: session.User.name,
					username: session.User.username,
					role: roles,
					exp: Math.floor(Date.now() / 1000) + 5 * 60,
				})

				const refreshToken = await jwt.sign({
					sub: payload.sub,
					sid: payload.sid,
					exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				})

				refresh_token.set({
					value: refreshToken,
					...refreshCookie,
				})

				access_token.set({
					value: accessToken,
					...accessCookie,
				})

				return { success: true }
			},
			{
				cookie: cookieSchema,
				detail: {
					tags: ['Auth'],
				},
			}
		)
)
