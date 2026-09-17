import { redis } from 'bun'

const PREFIX = 'stalhub:desktop-auth:'
const TTL_SECONDS = 120

export type DesktopAuthPayload = {
	user_id: number
	created_at: number
	code_challenge: string
}

function isValidChallenge(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}

function isValidVerifier(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(value)
}

/** Store a short-lived, PKCE-bound handoff. The code itself is opaque and never contains identity. */
export async function createDesktopAuthCode(
	user_id: number,
	code_challenge: string
): Promise<string> {
	if (!isValidChallenge(code_challenge))
		throw new Error('Invalid PKCE challenge')
	const code = `${crypto.randomUUID()}-${crypto.randomUUID()}`
	await redis.set(
		`${PREFIX}${code}`,
		JSON.stringify({ user_id, created_at: Date.now(), code_challenge }),
		'EX',
		TTL_SECONDS
	)
	return code
}

/** Redis GETDEL makes redemption atomic: concurrent requests cannot reuse a code. */
export async function consumeDesktopAuthCode(
	code: string,
	code_verifier: string
): Promise<DesktopAuthPayload | null> {
	if (!/^[0-9a-f-]{60,80}$/i.test(code) || !isValidVerifier(code_verifier))
		return null
	const raw = await redis.getdel(`${PREFIX}${code}`)
	if (!raw) return null
	try {
		const value = JSON.parse(raw) as DesktopAuthPayload
		if (
			!Number.isInteger(value.user_id) ||
			typeof value.code_challenge !== 'string' ||
			Date.now() - value.created_at > TTL_SECONDS * 1000
		)
			return null
		const digest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(code_verifier)
		)
		const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
			.replace(/=/g, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
		if (challenge !== value.code_challenge) return null
		return value
	} catch {
		return null
	}
}
