import {
	normalizeUnoRoute,
	unoUpstreamErrorsTotal,
	unoUpstreamRequestDurationSeconds,
	unoUpstreamRequestsTotal,
} from '@/app/api/metrics'
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

interface RequestOptions {
	signal?: AbortSignal
}

export function respond<T>(
	set: { status?: number | string },
	run: () => Promise<T>
) {
	return run().catch((error: unknown) => {
		if (error instanceof UnoApiError) {
			set.status = error.status
			return error.payload
		}
		console.error('[uno] unexpected error:', error)
		set.status = 502
		return { error: 'UNO API unavailable' }
	})
}

async function readResponseBody(
	response: Response,
	maxBytes: number
): Promise<string> {
	const contentLength = Number(response.headers.get('content-length'))
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		throw new UnoApiError(502, { error: 'UNO response is too large' })
	}

	if (!response.body) return ''

	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let total = 0

	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			if (!value) continue
			total += value.byteLength
			if (total > maxBytes) {
				throw new UnoApiError(502, {
					error: 'UNO response is too large',
				})
			}
			chunks.push(value)
		}
	} finally {
		reader.releaseLock()
	}

	const body = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		body.set(chunk, offset)
		offset += chunk.byteLength
	}
	return new TextDecoder().decode(body)
}

class UnoService {
	private get baseUrl() {
		return env.UNO_API_URL.replace(/\/+$/, '')
	}

	async request<T>(
		path: string,
		query: Record<string, QueryValue> = {},
		options: RequestOptions = {}
	): Promise<T> {
		if (!env.UNO_API_URL || !env.UNO_API_TOKEN) {
			throw new UnoApiError(503, { error: 'UNO API is not configured' })
		}

		const url = new URL(`${this.baseUrl}/v1${path}`)
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === '') continue
			url.searchParams.set(key, String(value))
		}

		const route = normalizeUnoRoute(path)
		const startedAt = Date.now()

		const record = (status: string, kind?: string) => {
			try {
				unoUpstreamRequestsTotal.inc({ route, status })
				unoUpstreamRequestDurationSeconds.observe(
					{ route },
					(Date.now() - startedAt) / 1000
				)
				if (kind) unoUpstreamErrorsTotal.inc({ route, kind })
			} catch (error) {
				console.error('[uno] metrics recording failed:', error)
			}
		}

		let response: Response
		try {
			const timeout = AbortSignal.timeout(env.UNO_API_TIMEOUT_MS)
			response = await fetch(url, {
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${env.UNO_API_TOKEN}`,
				},
				signal: options.signal
					? AbortSignal.any([timeout, options.signal])
					: timeout,
			})
		} catch (error) {
			const aborted =
				error instanceof Error && error.name === 'AbortError'
			if (aborted) {
				record('aborted', 'aborted')
				throw new UnoApiError(503, { error: 'UNO API aborted' })
			}
			const timedOut =
				error instanceof Error && error.name === 'TimeoutError'
			record(
				timedOut ? 'timeout' : 'network',
				timedOut ? 'timeout' : 'network'
			)
			console.error('[uno] request failed:', error)
			throw new UnoApiError(timedOut ? 504 : 502, {
				error: timedOut ? 'UNO API timeout' : 'UNO API unavailable',
			})
		}

		let raw: string
		try {
			raw = await readResponseBody(
				response,
				env.UNO_API_MAX_RESPONSE_BYTES
			)
		} catch (error) {
			if (error instanceof UnoApiError) record('too_large', 'too_large')
			else record('network', 'network')
			throw error
		}
		let body: unknown = null
		let parseFailed = false

		if (raw) {
			try {
				body = JSON.parse(raw)
			} catch {
				parseFailed = true
				body = { error: raw.slice(0, 500) }
			}
		}

		if (!response.ok) {
			record(String(response.status), 'http_error')
			throw new UnoApiError(
				response.status,
				body ?? { error: `UNO API responded ${response.status}` }
			)
		}

		record(parseFailed ? 'parse' : 'ok', parseFailed ? 'parse' : undefined)

		return body as T
	}
}

export const unoService = new UnoService()
