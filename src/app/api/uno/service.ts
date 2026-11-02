import { env } from '@/env'

export class UnoApiError extends Error {
	constructor(
		readonly status: number,
		readonly payload: unknown
	) {
		super('UNO API error')
		this.name = 'UnoApiError'
	}
}

type QueryValue = string | number | boolean | null | undefined

class UnoService {
	private get baseUrl() {
		return env.UNO_API_URL.replace(/\/+$/, '')
	}

	async request<T>(
		path: string,
		query: Record<string, QueryValue> = {}
	): Promise<T> {
		if (!env.UNO_API_URL || !env.UNO_API_TOKEN) {
			throw new UnoApiError(503, { error: 'UNO API is not configured' })
		}

		const url = new URL(`${this.baseUrl}/v1${path}`)
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === '') continue
			url.searchParams.set(key, String(value))
		}

		let response: Response
		try {
			response = await fetch(url, {
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${env.UNO_API_TOKEN}`,
				},
				signal: AbortSignal.timeout(env.UNO_API_TIMEOUT_MS),
			})
		} catch (error) {
			const timeout =
				error instanceof Error && error.name === 'TimeoutError'
			console.error('[uno] request failed:', error)
			throw new UnoApiError(timeout ? 504 : 502, {
				error: timeout ? 'UNO API timeout' : 'UNO API unavailable',
			})
		}

		const raw = await response.text()
		let body: unknown = null

		if (raw) {
			try {
				body = JSON.parse(raw)
			} catch {
				body = { error: raw.slice(0, 500) }
			}
		}

		if (!response.ok) {
			throw new UnoApiError(
				response.status,
				body ?? { error: `UNO API responded ${response.status}` }
			)
		}

		return body as T
	}
}

export const unoService = new UnoService()
