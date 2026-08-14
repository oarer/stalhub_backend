const BACKEND_URL =
	`${process.env.BACKEND_URL ?? 'http://localhost:3001'}`.replace(/\/$/, '') +
	'/api/v1'
const BOT_SECRET = process.env.DISCORD_BOT_SERVICE_JWT!

import { error, log } from './logger'

async function request(path: string, init: RequestInit = {}) {
	const method = init.method ?? 'GET'

	log(`→ ${method} ${path}`)

	const res = await fetch(`${BACKEND_URL}${path}`, {
		...init,
		headers: {
			'x-bot-secret': BOT_SECRET,
			...(init.headers ?? {}),
		},
	})

	const body = (await res.json().catch(() => null)) as {
		error?: string
		[key: string]: unknown
	} | null

	if (!res.ok) {
		const errorMessage =
			body?.error ?? res.statusText ?? `HTTP ${res.status}`

		error(`← ${method} ${path} -> ${res.status}: ${errorMessage}`)

		throw new Error(errorMessage)
	}

	log(`← ${method} ${path} -> ${res.status}`)

	return body
}

export function backendGet(path: string) {
	return request(path)
}

export function backendPost(path: string, body: unknown) {
	return request(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
}

export function backendPatch(path: string, body: unknown) {
	return request(path, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
}

export function backendDelete(path: string, body: unknown) {
	return request(path, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
}

export function backendUpload(path: string, form: FormData) {
	return request(path, { method: 'POST', body: form })
}
