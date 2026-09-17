import { redis } from 'bun'
import { t } from 'elysia'
import { createDesktopAuthCode } from './desktop-auth'

export const desktopLoginQuery = t.Object({
	desktop_state: t.Optional(t.String({ pattern: '^[A-Za-z0-9_-]{43,128}$' })),
	code_challenge: t.Optional(t.String({ pattern: '^[A-Za-z0-9_-]{43}$' })),
})
type Binding = { state: string; challenge: string; redirectUri: string }
const prefix = 'stalhub:desktop-state:'

export async function bindDesktopLogin(
	query: { desktop_state?: string; code_challenge?: string },
	providerState: string,
	request: Request,
	provider: string
): Promise<string | null> {
	if (!query.desktop_state && !query.code_challenge) return null
	if (!query.desktop_state || !query.code_challenge)
		throw new Error('Desktop state and PKCE challenge required')
	const publicOrigin = new URL(
		process.env.DESKTOP_AUTH_ORIGIN || 'https://api.stalhub.dev'
	)
	if (publicOrigin.protocol !== 'https:')
		throw new Error('Desktop callback requires HTTPS')
	const redirectUri = `${publicOrigin.origin}/api/v1/auth/${provider}/callback`
	await redis.set(
		prefix + provider + ':' + providerState,
		JSON.stringify({
			state: query.desktop_state,
			challenge: query.code_challenge,
			redirectUri,
		}),
		'EX',
		600
	)
	return redirectUri
}

export async function takeDesktopLogin(
	provider: string,
	providerState?: string
): Promise<Binding | null> {
	if (!providerState) return null
	const raw = await redis.getdel(prefix + provider + ':' + providerState)
	return raw ? (JSON.parse(raw) as Binding) : null
}

export async function finishDesktopLogin(
	userId: number,
	binding: Binding
): Promise<Response> {
	const code = await createDesktopAuthCode(userId, binding.challenge)
	const url = new URL('stalhub://auth/callback')
	url.searchParams.set('code', code)
	url.searchParams.set('state', binding.state)
	return new Response(null, {
		status: 302,
		headers: {
			Location: url.toString(),
			'Cache-Control': 'no-store',
			'Referrer-Policy': 'no-referrer',
		},
	})
}
