import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { createElysia } from '@/utils/elysia'
import { createSession } from '@/utils/auth.service'
import { jwtPlugin, refreshCookie, accessCookie } from '@/utils/jwt.plugin'
import { fromStore, requireAuth } from '@/utils/auth.guard'

const TELEGRAM_ISS = 'https://oauth.telegram.org'

function base64urlDecode(str: string): Uint8Array {
	str = str.replace(/-/g, '+').replace(/_/g, '/')
	while (str.length % 4) str += '='
	return Uint8Array.from(atob(str), (c) => c.charCodeAt(0))
}

function base64urlEncode(buf: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buf)))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
}

function decodeJwtPayload(
	payload: string,
): Record<string, string | number | undefined> {
	return JSON.parse(new TextDecoder().decode(base64urlDecode(payload)))
}

let cachedJwks: { keys: JsonWebKey[] } | null = null
let jwksFetchedAt = 0

async function getJwks(): Promise<JsonWebKey[]> {
	if (cachedJwks && Date.now() - jwksFetchedAt < 3600_000) {
		return cachedJwks.keys
	}
	const res = await fetch(
		'https://oauth.telegram.org/.well-known/jwks.json',
	)
	if (!res.ok) throw new Error('Failed to fetch JWKS')
	const data = (await res.json()) as { keys: JsonWebKey[] }
	cachedJwks = data
	jwksFetchedAt = Date.now()
	return data.keys
}

async function validateIdToken(idToken: string) {
	const parts = idToken.split('.')
	if (parts.length !== 3) return null

	const [headerRaw, payloadRaw, signatureRaw] = parts

	let header: { alg: string; kid?: string; typ?: string }
	try {
		header = JSON.parse(
			new TextDecoder().decode(base64urlDecode(headerRaw)),
		)
	} catch {
		return null
	}

	if (header.alg !== 'RS256') return null

	const keys = await getJwks()
	const jwk = keys.find(
		(k) => (k as Record<string, string>).kid === header.kid,
	)
	if (!jwk) return null

	const key = await crypto.subtle.importKey(
		'jwk',
		jwk,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['verify'],
	)

	const data = new TextEncoder()
		.encode(`${headerRaw}.${payloadRaw}`)
		.buffer as ArrayBuffer
	const signature = base64urlDecode(signatureRaw).buffer as ArrayBuffer

	const valid = await crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		key,
		signature,
		data,
	)

	if (!valid) return null

	const payload = decodeJwtPayload(payloadRaw) as Record<string, unknown>

	if (payload.iss !== TELEGRAM_ISS) return null
	if (String(payload.aud) !== env.TELEGRAM_CLIENT_ID) return null
	if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp)
		return null

	const sub = String(payload.sub ?? '')
	if (!sub) return null

	return {
		id: sub,
		name: String(payload.name ?? ''),
		username: String(payload.preferred_username ?? ''),
		avatar: String(payload.picture ?? ''),
	}
}

const stateStore = new Map<
	string,
	{ verifier: string; expiresAt: number; userId?: string }
>()

export function storeTelegramState(
	state: string,
	verifier: string,
	userId?: string,
) {
	stateStore.set(state, {
		verifier,
		userId,
		expiresAt: Date.now() + 10 * 60 * 1000,
	})
}

export const telegramAuth = createElysia()
	.use(jwtPlugin)
	.group('/telegram', (app) =>
		app
			.get('/login', async () => {
				const verifier = base64urlEncode(
					crypto.getRandomValues(new Uint8Array(32)).buffer,
				)
				const challenge = base64urlEncode(
					await crypto.subtle.digest(
						'SHA-256',
						new TextEncoder().encode(verifier),
					),
				)
				const state = crypto.randomUUID()

				stateStore.set(state, {
					verifier,
					expiresAt: Date.now() + 10 * 60 * 1000,
				})

				const url = new URL('https://oauth.telegram.org/auth')
				url.searchParams.set('client_id', env.TELEGRAM_CLIENT_ID)
				url.searchParams.set(
					'redirect_uri',
					env.TELEGRAM_REDIRECT_URI,
				)
				url.searchParams.set('response_type', 'code')
				url.searchParams.set('scope', 'openid profile')
				url.searchParams.set('state', state)
				url.searchParams.set('code_challenge', challenge)
				url.searchParams.set('code_challenge_method', 'S256')

				return { url: url.toString() }
			},
				{
					detail: {
						tags: ['Auth: Telegram'],
					},
				}
			)

			.get('/callback', async ({ query, headers, cookie: { refresh_token, access_token }, jwt, set }) => {
				const params = query as Record<string, string | undefined>
				const code = params.code
				const state = params.state

				if (!code || !state) {
					set.status = 400
					return { error: 'Missing code or state' }
				}

				const stored = stateStore.get(state)
				if (!stored || stored.expiresAt < Date.now()) {
					set.status = 403
					return { error: 'Invalid or expired state' }
				}
				stateStore.delete(state)

				const basic = btoa(
					`${env.TELEGRAM_CLIENT_ID}:${env.TELEGRAM_CLIENT_SECRET}`,
				)

				const tokenRes = await fetch(
					'https://oauth.telegram.org/token',
					{
						method: 'POST',
						headers: {
							'Content-Type':
								'application/x-www-form-urlencoded',
							Authorization: `Basic ${basic}`,
						},
						body: new URLSearchParams({
							grant_type: 'authorization_code',
							code,
							redirect_uri: env.TELEGRAM_REDIRECT_URI,
							client_id: env.TELEGRAM_CLIENT_ID,
							code_verifier: stored.verifier,
						}),
					},
				)

				if (!tokenRes.ok) {
					set.status = 400
					return { error: 'Failed to exchange code' }
				}

				const tokenData = (await tokenRes.json()) as {
					id_token: string
				}

				const user = await validateIdToken(tokenData.id_token)
				if (!user) {
					set.status = 403
					return { error: 'Invalid id_token' }
				}

				if (stored.userId) {
					const existing = await prisma.telegramAuth.findUnique({
						where: { telegram_id: user.id },
					})
					if (existing) {
						set.status = 409
						return { error: 'This Telegram account is already linked to another user' }
					}

					await prisma.telegramAuth.create({
						data: {
							telegram_id: user.id,
							name: user.name,
							login: user.username,
							avatar_id: user.avatar,
							userid: stored.userId,
						},
					})

					return { success: true, linked: true }
				}

				const existing = await prisma.telegramAuth.findUnique({
					where: { telegram_id: user.id },
				})

				let userId: string
				if (existing) {
					userId = existing.userid
				} else {
					const created = await prisma.user.create({
						data: {
							id: crypto.randomUUID(),
							username: user.username,
							name: user.name,
							TelegramAuth: {
								create: {
									telegram_id: user.id,
									name: user.name,
									login: user.username,
									avatar_id: user.avatar,
								},
							},
						},
					})
					userId = created.id
				}

				const userData = await prisma.user.findUnique({
					where: { id: userId },
					include: { roles: { include: { role: true } } },
				})
				const roleNames = userData?.roles.map((r) => r.role.name) ?? []
				const ua =
					(headers as Record<string, string | undefined>)[
					'user-agent'
					] ?? ''
				const session = await createSession(userId, ua)
				const accessToken = await jwt.sign({
					sub: userId,
					sid: session.sessionId,
					name: userData?.name ?? '',
					username: userData?.username ?? '',
					role: roleNames,
					exp: Math.floor(Date.now() / 1000) + 5 * 60,
				})
				const refreshToken = await jwt.sign({
					sub: userId,
					sid: session.sessionId,
					exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				})

				refresh_token.set({
					value: refreshToken,
					...refreshCookie
				})
				access_token.set({
					value: accessToken,
					...accessCookie
				})

				return { success: true }
			},
				{
					detail: {
						tags: ['Auth: Telegram'],
					},
				})

			.post('/callback', async ({ body, headers, cookie: { access_token, refresh_token }, jwt, set }) => {
				const { id_token } = body as { id_token?: string }

				if (!id_token) {
					set.status = 400
					return { error: 'Missing id_token' }
				}

				const user = await validateIdToken(id_token)
				if (!user) {
					set.status = 403
					return { error: 'Invalid id_token' }
				}

				const existing = await prisma.telegramAuth.findUnique({
					where: { telegram_id: user.id },
				})

				let userId: string
				if (existing) {
					userId = existing.userid
				} else {
					const created = await prisma.user.create({
						data: {
							id: crypto.randomUUID(),
							username: user.username,
							name: user.name,
							TelegramAuth: {
								create: {
									telegram_id: user.id,
									name: user.name,
									login: user.username,
									avatar_id: user.avatar,
								},
							},
						},
					})
					userId = created.id
				}

				const userData = await prisma.user.findUnique({
					where: { id: userId },
					include: { roles: { include: { role: true } } },
				})
				const roleNames = userData?.roles.map((r) => r.role.name) ?? []
				const ua =
					(headers as Record<string, string | undefined>)[
					'user-agent'
					] ?? ''
				const session = await createSession(userId, ua)
				const accessToken = await jwt.sign({
					sub: userId,
					sid: session.sessionId,
					name: userData?.name ?? '',
					username: userData?.username ?? '',
					role: roleNames,
					exp: Math.floor(Date.now() / 1000) + 5 * 60,
				})
				const refreshToken = await jwt.sign({
					sub: userId,
					sid: session.sessionId,
					exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				})

				refresh_token.set({
					value: refreshToken,
					...refreshCookie
				})
				access_token.set({
					value: accessToken,
					...accessCookie
				})

				return { success: true }
			},
				{
					detail: {
						tags: ['Auth: Telegram'],
					},
				}
			)

			.get('/link', async ({ store }) => {
				const { userId } = fromStore(store)
				const existing = await prisma.telegramAuth.findUnique({
					where: { userid: userId },
				})
				if (existing) {
					return { error: 'Telegram already linked' }
				}

				const verifier = base64urlEncode(
					crypto.getRandomValues(new Uint8Array(32)).buffer,
				)
				const challenge = base64urlEncode(
					await crypto.subtle.digest(
						'SHA-256',
						new TextEncoder().encode(verifier),
					),
				)
				const state = crypto.randomUUID()
				storeTelegramState(state, verifier, userId)

				const url = new URL(`${TELEGRAM_ISS}/auth`)
				url.searchParams.set('client_id', env.TELEGRAM_CLIENT_ID)
				url.searchParams.set('redirect_uri', env.TELEGRAM_REDIRECT_URI)
				url.searchParams.set('response_type', 'code')
				url.searchParams.set('scope', 'openid profile')
				url.searchParams.set('state', state)
				url.searchParams.set('code_challenge', challenge)
				url.searchParams.set('code_challenge_method', 'S256')
				return { url: url.toString(), verifier }
			},
				{
					beforeHandle: [requireAuth],
					detail: { tags: ['Auth: Telegram'] },
				}
			)

			.delete('/link', async ({ store }) => {
				const { userId } = fromStore(store)
				await prisma.telegramAuth.deleteMany({ where: { userid: userId } })
				return { success: true }
			},
				{
					beforeHandle: [requireAuth],
					detail: { tags: ['Auth: Telegram'] },
				}
			),
	)
