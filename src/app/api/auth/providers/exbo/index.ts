import { t } from 'elysia'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { fromStore, requireAuth } from '@/utils/auth.guard'
import { assignDefaultRole, createSession } from '@/utils/auth.service'
import { createElysia } from '@/utils/elysia'
import { accessCookie, jwtPlugin, refreshCookie } from '@/utils/jwt.plugin'
import { consumeLinkState, createLinkState } from '@/utils/link.state'

export const exboAuth = createElysia()
	.use(jwtPlugin)
	.group('/exbo', (app) =>
		app
			.get(
				'/login',
				async () => {
					const state = crypto.randomUUID()

					await prisma.eXBOAuthState.create({
						data: {
							state,
							expires_at: new Date(Date.now() + 10 * 60 * 1000),
						},
					})

					const url = new URL('https://exbo.net/oauth/authorize')
					url.searchParams.set('client_id', env.EXBO_CLIENT_ID)
					url.searchParams.set('redirect_uri', env.EXBO_REDIRECT_URI)
					url.searchParams.set('response_type', 'code')
					url.searchParams.set('scope', '')
					url.searchParams.set('state', state)

					return { url: url.toString() }
				},
				{
					detail: {
						tags: ['Auth: Exbo'],
					},
				}
			)

			.get(
				'/callback',
				async ({
					query: { code, state },
					headers,
					cookie: { refresh_token, access_token },
					jwt,
					set,
				}) => {
					const linkUserId = state ? consumeLinkState(state) : null

					if (!linkUserId) {
						const storedState =
							await prisma.eXBOAuthState.findUnique({
								where: { state },
							})

						if (
							!storedState ||
							storedState.expires_at < new Date()
						) {
							set.status = 403
							return { error: 'Invalid or expired state' }
						}

						await prisma.eXBOAuthState.delete({
							where: { id: storedState.id },
						})
					}

					const tokenBody = new URLSearchParams({
						client_id: env.EXBO_CLIENT_ID,
						client_secret: env.EXBO_CLIENT_SECRET,
						code,
						grant_type: 'authorization_code',
						redirect_uri: env.EXBO_REDIRECT_URI,
					})

					const tokenRes = await fetch(
						'https://exbo.net/oauth/token',
						{
							method: 'POST',
							headers: {
								'Content-Type':
									'application/x-www-form-urlencoded',
							},
							body: tokenBody,
						}
					)

					const tokenText = await tokenRes.text()

					if (!tokenRes.ok) {
						set.status = 400
						return {
							error: 'Failed to exchange code',
							status: tokenRes.status,
							body: tokenText,
						}
					}

					let tokenData: {
						access_token: string
						refresh_token?: string
						expires_in: number
						refresh_expires_in?: number
					}
					try {
						tokenData = JSON.parse(tokenText)
					} catch {
						set.status = 400
						return {
							error: 'Invalid token response',
							body: tokenText,
						}
					}

					const userRes = await fetch('https://exbo.net/oauth/user', {
						headers: {
							Authorization: `Bearer ${tokenData.access_token}`,
						},
					})

					if (!userRes.ok) {
						set.status = 400
						return { error: 'Failed to fetch user' }
					}

					const exboUser = (await userRes.json()) as {
						uuid: string
						display_login: string
						login: string
					}

					const tokenBlob = Buffer.from(
						JSON.stringify({
							access_token: tokenData.access_token,
							refresh_token: tokenData.refresh_token,
						})
					).toString('base64')

					if (linkUserId) {
						const existing = await prisma.eXBOAuth.findUnique({
							where: { exbo_id: exboUser.uuid },
						})
						if (existing) {
							set.status = 409
							return {
								error: 'This EXBO account is already linked to another user',
							}
						}

						await prisma.eXBOAuth.create({
							data: {
								exbo_id: exboUser.uuid,
								login: exboUser.login,
								username: exboUser.display_login,
								token_blob: tokenBlob,
								access_expires_at: new Date(
									Date.now() + tokenData.expires_in * 1000
								),
								refresh_expires_at: tokenData.refresh_expires_in
									? new Date(
											Date.now() +
												tokenData.refresh_expires_in *
													1000
										)
									: null,
								userid: linkUserId,
							},
						})

						return { success: true, linked: true }
					}

					const existing = await prisma.eXBOAuth.findUnique({
						where: { exbo_id: exboUser.uuid },
					})

					let userId: number
					if (existing) {
						userId = existing.userid
						await prisma.eXBOAuth.update({
							where: { id: existing.id },
							data: {
								token_blob: tokenBlob,
								access_expires_at: new Date(
									Date.now() + tokenData.expires_in * 1000
								),
								refresh_expires_at: tokenData.refresh_expires_in
									? new Date(
											Date.now() +
												tokenData.refresh_expires_in *
													1000
										)
									: null,
							},
						})
					} else {
						const user = await prisma.user.create({
							data: {
								username: exboUser.login,
								name: exboUser.display_login,
								EXBOAuth: {
									create: {
										exbo_id: exboUser.uuid,
										login: exboUser.login,
										username: exboUser.display_login,
										token_blob: tokenBlob,
										access_expires_at: new Date(
											Date.now() +
												tokenData.expires_in * 1000
										),
										refresh_expires_at:
											tokenData.refresh_expires_in
												? new Date(
														Date.now() +
															tokenData.refresh_expires_in *
																1000
													)
												: null,
									},
								},
							},
						})
						userId = user.id
						await assignDefaultRole(userId)
					}

					const userData = await prisma.user.findUnique({
						where: { id: userId },
						include: { roles: true },
					})
					const roleNames =
						userData?.roles.map((r) => r.name) ?? []
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
						name: userData?.name ?? '',
						username: userData?.username ?? '',
						role: roleNames,
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
						state: t.String(),
					}),
					detail: {
						tags: ['Auth: Exbo'],
					},
				}
			)

			.get(
				'/link',
				async ({ store }) => {
					const { userId } = fromStore(store)
					const existing = await prisma.eXBOAuth.findUnique({
						where: { userid: userId },
					})
					if (existing) {
						return { error: 'EXBO already linked' }
					}

					const state = createLinkState(userId)

					await prisma.eXBOAuthState.create({
						data: {
							state,
							expires_at: new Date(Date.now() + 10 * 60 * 1000),
						},
					})

					const url = new URL('https://exbo.net/oauth/authorize')
					url.searchParams.set('client_id', env.EXBO_CLIENT_ID)
					url.searchParams.set('redirect_uri', env.EXBO_REDIRECT_URI)
					url.searchParams.set('response_type', 'code')
					url.searchParams.set('scope', '')
					url.searchParams.set('state', state)
					return { url: url.toString() }
				},
				{
					beforeHandle: [requireAuth],
					detail: { tags: ['Auth: Exbo'] },
				}
			)

			.delete(
				'/link',
				async ({ store }) => {
					const { userId } = fromStore(store)
					await prisma.eXBOAuth.deleteMany({
						where: { userid: userId },
					})
					return { success: true }
				},
				{
					beforeHandle: [requireAuth],
					detail: { tags: ['Auth: Exbo'] },
				}
			)
	)
