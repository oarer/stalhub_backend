import { t } from 'elysia'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { fromStore, requireAuth } from '@/utils/auth.guard'
import { authService, createSession } from '@/utils/auth.service'
import {
	clearLoginFailures,
	clientIp,
	isIpBlocked,
	recordLoginFailure,
} from '@/utils/auto-ban'
import { verifyPassword } from '@/utils/crypto'
import {
	consumeDesktopAuthCode,
	createDesktopAuthCode,
} from '@/utils/desktop-auth'
import { desktopLoginQuery } from '@/utils/desktop-provider'
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
			'/desktop/exchange',
			async ({
				body,
				headers,
				cookie: { access_token, refresh_token },
				jwt,
				set,
			}) => {
				const exchange = await consumeDesktopAuthCode(
					body.code,
					body.code_verifier
				)
				if (!exchange) {
					set.status = 400
					return { error: 'Invalid or expired desktop code' }
				}
				const user = await prisma.user.findUnique({
					where: { id: exchange.user_id },
					include: { roles: true },
				})
				if (!user) {
					set.status = 404
					return { error: 'User not found' }
				}
				const h = headers as Record<string, string | undefined>
				const session = await createSession(
					user.id,
					h['user-agent'] ?? 'Stalhub Desktop',
					h['x-forwarded-for'] ?? ''
				)
				const roles = user.roles.map((role) => role.name)
				const accessValue = await jwt.sign({
					sub: String(user.id),
					sid: session.session_id,
					name: user.name,
					username: user.username,
					role: roles,
					exp: Math.floor(Date.now() / 1000) + 5 * 60,
				})
				const refreshValue = await jwt.sign({
					sub: String(user.id),
					sid: session.session_id,
					exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				})
				refresh_token.set({ value: refreshValue, ...refreshCookie })
				access_token.set({ value: accessValue, ...accessCookie })
				const fullSession = await authService.getSession(
					session.session_id
				)
				return {
					success: true,
					user: fullSession
						? authService.userPayload(fullSession)
						: null,
				}
			},
			{
				body: t.Object({
					code: t.String({ minLength: 20, maxLength: 100 }),
					code_verifier: t.String({ minLength: 43, maxLength: 128 }),
				}),
				detail: { tags: ['Auth'] },
			}
		)
		.get(
			'/desktop/start',
			({ query, set }) => {
				if (!query.desktop_state || !query.code_challenge) {
					set.status = 400
					return {
						error: 'Desktop state and PKCE challenge required',
					}
				}
				const url = new URL('/auth', env.WEB_ORIGIN)
				url.searchParams.set('desktop_state', query.desktop_state)
				url.searchParams.set('code_challenge', query.code_challenge)
				return { url: url.toString() }
			},
			{
				query: desktopLoginQuery,
				detail: { tags: ['Auth'] },
			}
		)
		.post(
			'/desktop/issue',
			async ({ body, store }) => {
				const code = await createDesktopAuthCode(
					fromStore(store).user_id,
					body.code_challenge
				)
				const url = new URL('stalhub://auth/callback')
				url.searchParams.set('code', code)
				url.searchParams.set('state', body.desktop_state)
				return { success: true, url: url.toString() }
			},
			{
				body: t.Object({
					desktop_state: t.String({
						pattern: '^[A-Za-z0-9_-]{43,128}$',
					}),
					code_challenge: t.String({
						pattern: '^[A-Za-z0-9_-]{43}$',
					}),
				}),
				beforeHandle: [requireAuth],
				detail: { tags: ['Auth'] },
			}
		)
		.post(
			'/login',
			async ({
				body,
				headers,
				request,
				cookie: { access_token, refresh_token },
				jwt,
				set,
				server,
			}) => {
				const h = headers as Record<string, string | undefined>
				const ua = h['user-agent'] ?? ''
				const ip = clientIp(
					h,
					server?.requestIP?.(request)?.address ?? ''
				)

				if (await isIpBlocked(ip)) {
					set.status = 429
					return { error: 'Too many requests, try again later' }
				}

				const user = await prisma.user.findFirst({
					where: {
						username: {
							equals: body.username,
							mode: 'insensitive',
						},
					},
					include: { roles: true },
				})
				if (
					!user ||
					!user.password_hash ||
					!verifyPassword(body.password, user.password_hash)
				) {
					await recordLoginFailure(body.username, ip)
					set.status = 401
					return { error: 'Invalid username or password' }
				}

				await clearLoginFailures(body.username, ip)

				const roles = user.roles.map((r) => r.name)
				const session = await createSession(user.id, ua, ip)
				const access_token_value = await jwt.sign({
					sub: String(user.id),
					sid: session.session_id,
					name: user.name,
					username: user.username,
					role: roles,
					exp: Math.floor(Date.now() / 1000) + 5 * 60,
				})
				const refreshToken = await jwt.sign({
					sub: String(user.id),
					sid: session.session_id,
					exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				})

				refresh_token.set({ value: refreshToken, ...refreshCookie })
				access_token.set({ value: access_token_value, ...accessCookie })

				return { success: true }
			},
			{
				body: t.Object({
					username: t.String({ minLength: 1 }),
					password: t.String({ minLength: 1 }),
				}),
				detail: { tags: ['Auth'] },
			}
		)

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

				const roles = session.user.roles.map((r) => r.name)

				const access_token_value = await jwt.sign({
					sub: payload.sub,
					sid: payload.sid,
					name: session.user.name,
					username: session.user.username,
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
					value: access_token_value,
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
