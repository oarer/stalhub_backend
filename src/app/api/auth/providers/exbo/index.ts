import { t } from 'elysia'
import { clanService } from '@/app/api/clan/services/clan'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { Regions } from '@/types/api.type'
import { fromStore, requireAuth } from '@/utils/auth.guard'
import { assignDefaultRole, createSession } from '@/utils/auth.service'
import { decryptSecretJson, encryptSecret } from '@/utils/crypto'
import { createElysia } from '@/utils/elysia'
import { accessCookie, jwtPlugin, refreshCookie } from '@/utils/jwt.plugin'
import { consumeLinkState, createLinkState } from '@/utils/link.state'

const REGION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

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
					query: { code, state, region },
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

					const tokenBlob = encryptSecret(
						JSON.stringify({
							access_token: tokenData.access_token,
							refresh_token: tokenData.refresh_token,
						})
					)

					const selectedRegion = region ?? null

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
								region: selectedRegion,
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
						try {
							if (selectedRegion) {
								await clanService.detectFromExboCharacters(
									linkUserId,
									selectedRegion,
									tokenData.access_token
								)
							}
						} catch {
							// no block
						}

						return { success: true, linked: true }
					}

					const existing = await prisma.eXBOAuth.findUnique({
						where: { exbo_id: exboUser.uuid },
					})

					let user_id: number
					if (existing) {
						user_id = existing.userid
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
								username: exboUser.display_login,
								name: exboUser.login,
								exbo_auth: {
									create: {
										exbo_id: exboUser.uuid,
										login: exboUser.login,
										username: exboUser.display_login,
										token_blob: tokenBlob,
										region: selectedRegion,
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
						user_id = user.id
						await assignDefaultRole(user_id)
					}
					try {
						const detectRegion = existing?.region ?? selectedRegion
						if (detectRegion) {
							await clanService.detectFromExboCharacters(
								user_id,
								detectRegion,
								tokenData.access_token
							)
						}
					} catch {
						// no block
					}

					const userData = await prisma.user.findUnique({
						where: { id: user_id },
						include: { roles: true },
					})
					const roleNames = userData?.roles.map((r) => r.name) ?? []
					const ua =
						(headers as Record<string, string | undefined>)[
							'user-agent'
						] ?? ''
					const h = headers as Record<string, string | undefined>
					const ip =
						h['x-forwarded-for']?.split(',')[0]?.trim() ??
						h['x-real-ip'] ??
						''
					const session = await createSession(user_id, ua, ip)
					const access_token_value = await jwt.sign({
						sub: String(user_id),
						sid: session.session_id,
						name: userData?.name ?? '',
						username: userData?.username ?? '',
						role: roleNames,
						exp: Math.floor(Date.now() / 1000) + 5 * 60,
					})
					const refreshToken = await jwt.sign({
						sub: String(user_id),
						sid: session.session_id,
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
					query: t.Object({
						code: t.String(),
						state: t.String(),
						region: t.Optional(t.Enum(Regions)),
					}),
					detail: {
						tags: ['Auth: Exbo'],
					},
				}
			)

			.get(
				'/link',
				async ({ store }) => {
					const { user_id } = fromStore(store)
					const existing = await prisma.eXBOAuth.findUnique({
						where: { userid: user_id },
					})
					if (existing) {
						return { error: 'EXBO already linked' }
					}

					const state = createLinkState(user_id)

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
					const { user_id } = fromStore(store)
					await prisma.eXBOAuth.deleteMany({
						where: { userid: user_id },
					})
					return { success: true }
				},
				{
					beforeHandle: [requireAuth],
					detail: { tags: ['Auth: Exbo'] },
				}
			)

			.get(
				'/region',
				async ({ store, set }) => {
					const { user_id } = fromStore(store)
					const auth = await prisma.eXBOAuth.findUnique({
						where: { userid: user_id },
					})
					if (!auth) {
						set.status = 404
						return { error: 'EXBO account is not linked' }
					}
					const canChangeAt = auth.region_changed_at
						? new Date(
								auth.region_changed_at.getTime() +
									REGION_COOLDOWN_MS
							)
						: null
					return {
						region: auth.region,
						region_changed_at: auth.region_changed_at,
						can_change_at: canChangeAt,
						retry_after: canChangeAt
							? Math.max(
									0,
									Math.ceil(
										(canChangeAt.getTime() - Date.now()) /
											1000
									)
								)
							: 0,
					}
				},
				{
					beforeHandle: [requireAuth],
					detail: { tags: ['Auth: Exbo'] },
				}
			)

			.patch(
				'/region',
				async ({ body, store, set }) => {
					const { user_id } = fromStore(store)
					const auth = await prisma.eXBOAuth.findUnique({
						where: { userid: user_id },
					})
					if (!auth) {
						set.status = 404
						return { error: 'EXBO account is not linked' }
					}

					if (auth.region === body.region) {
						return { success: true, region: auth.region }
					}

					if (auth.region_changed_at) {
						const nextAllowed =
							auth.region_changed_at.getTime() +
							REGION_COOLDOWN_MS
						if (Date.now() < nextAllowed) {
							const canChangeAt = new Date(nextAllowed)
							set.status = 429
							return {
								error: 'Region can be changed once every 7 days',
								region: auth.region,
								can_change_at: canChangeAt,
								retry_after: Math.ceil(
									(nextAllowed - Date.now()) / 1000
								),
							}
						}
					}

					const updated = await prisma.eXBOAuth.update({
						where: { id: auth.id },
						data: {
							region: body.region,
							region_changed_at: new Date(),
						},
					})

					try {
						if (updated.region) {
							const { access_token } = decryptSecretJson<{
								access_token: string
							}>(updated.token_blob)
							if (access_token) {
								await clanService.detectFromExboCharacters(
									user_id,
									updated.region,
									access_token
								)
							}
						}
					} catch {
						// no block
					}

					return {
						success: true,
						region: updated.region,
						region_changed_at: updated.region_changed_at,
					}
				},
				{
					beforeHandle: [requireAuth],
					body: t.Object({ region: t.Enum(Regions) }),
					detail: { tags: ['Auth: Exbo'] },
				}
			)
	)
