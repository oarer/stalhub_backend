import { t } from 'elysia'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { fromStore, requireAuth } from '@/utils/auth.guard'
import { assignDefaultRole, createSession } from '@/utils/auth.service'
import { createElysia } from '@/utils/elysia'
import { accessCookie, jwtPlugin, refreshCookie } from '@/utils/jwt.plugin'
import { consumeLinkState, createLinkState } from '@/utils/link.state'

const DISCORD_API = 'https://discord.com/api/v10'

export const discordAuth = createElysia()
	.use(jwtPlugin)
	.group('/discord', (app) =>
		app
			.get(
				'/login',
				() => {
					const url = new URL(`${DISCORD_API}/oauth2/authorize`)
					url.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
					url.searchParams.set(
						'redirect_uri',
						env.DISCORD_REDIRECT_URI
					)
					url.searchParams.set('response_type', 'code')
					url.searchParams.set('scope', 'identify')
					return { url: url.toString() }
				},
				{
					detail: {
						tags: ['Auth: Discord'],
					},
				}
			)

			.get(
				'/callback',
				async ({
					query: { code, state },
					headers,
					cookie: { access_token, refresh_token },
					jwt,
					set,
				}) => {
					const linkUserId = state ? consumeLinkState(state) : null

					const tokenRes = await fetch(
						`${DISCORD_API}/oauth2/token`,
						{
							method: 'POST',
							headers: {
								'Content-Type':
									'application/x-www-form-urlencoded',
							},
							body: new URLSearchParams({
								client_id: env.DISCORD_CLIENT_ID,
								client_secret: env.DISCORD_CLIENT_SECRET,
								code,
								grant_type: 'authorization_code',
								redirect_uri: env.DISCORD_REDIRECT_URI,
							}),
						}
					)

					if (!tokenRes.ok) {
						set.status = 400
						return { error: 'Failed to exchange code' }
					}

					const tokenData = (await tokenRes.json()) as {
						access_token: string
					}

					const userRes = await fetch(`${DISCORD_API}/users/@me`, {
						headers: {
							Authorization: `Bearer ${tokenData.access_token}`,
						},
					})

					if (!userRes.ok) {
						set.status = 400
						return { error: 'Failed to fetch user' }
					}

					const discordUser = (await userRes.json()) as {
						id: string
						username: string
						global_name: string | null
						avatar: string | null
					}

					if (linkUserId) {
						const existing = await prisma.discordAuth.findUnique({
							where: { discord_id: discordUser.id },
						})
						if (existing) {
							set.status = 409
							return {
								error: 'This Discord account is already linked to another user',
							}
						}

						await prisma.discordAuth.create({
							data: {
								discord_id: discordUser.id,
								name:
									discordUser.global_name ??
									discordUser.username,
								username: discordUser.username,
								avatar_id: discordUser.avatar,
								userid: linkUserId,
							},
						})

						return { success: true, linked: true }
					}

					const existing = await prisma.discordAuth.findUnique({
						where: { discord_id: discordUser.id },
					})

					let userId: number
					if (existing) {
						userId = existing.userid
					} else {
						const user = await prisma.user.create({
							data: {
								username: discordUser.username,
								name:
									discordUser.global_name ??
									discordUser.username,
								DiscordAuth: {
									create: {
										discord_id: discordUser.id,
										name:
											discordUser.global_name ??
											discordUser.username,
										username: discordUser.username,
										avatar_id: discordUser.avatar,
									},
								},
							},
						})
						userId = user.id
						await assignDefaultRole(userId)
					}

					const user = await prisma.user.findUnique({
						where: { id: userId },
						include: { roles: true },
					})
					const roles = user?.roles.map((r) => r.name) ?? []
					const ua =
						(headers as Record<string, string | undefined>)[
							'user-agent'
						] ?? ''
					const h = headers as Record<string, string | undefined>
					const ip = (h['x-forwarded-for']?.split(',')[0]?.trim() ?? h['x-real-ip'] ?? '')
					const session = await createSession(userId, ua, ip)
					const accessToken = await jwt.sign({
						sub: String(userId),
						sid: session.sessionId,
						name: user?.name ?? '',
						username: user?.username ?? '',
						role: roles,
						exp: Math.floor(Date.now() / 1000) + 5 * 60,
					})
					const refreshToken = await jwt.sign({
						sub: String(userId),
						sid: session.sessionId,
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
					query: t.Object({
						code: t.String(),
						state: t.Optional(t.String()),
					}),
					detail: {
						tags: ['Auth: Discord'],
					},
				}
			)

			.get(
				'/link',
				async ({ store }) => {
					const { userId } = fromStore(store)
					const existing = await prisma.discordAuth.findUnique({
						where: { userid: userId },
					})
					if (existing) {
						return { error: 'Discord already linked' }
					}

					const state = createLinkState(userId)
					const url = new URL(`${DISCORD_API}/oauth2/authorize`)
					url.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
					url.searchParams.set(
						'redirect_uri',
						env.DISCORD_REDIRECT_URI
					)
					url.searchParams.set('response_type', 'code')
					url.searchParams.set('scope', 'identify')
					url.searchParams.set('state', state)
					return { url: url.toString() }
				},
				{
					beforeHandle: [requireAuth],
					detail: { tags: ['Auth: Discord'] },
				}
			)

			.delete(
				'/link',
				async ({ store }) => {
					const { userId } = fromStore(store)
					await prisma.discordAuth.deleteMany({
						where: { userid: userId },
					})
					return { success: true }
				},
				{
					beforeHandle: [requireAuth],
					detail: { tags: ['Auth: Discord'] },
				}
			)
	)
