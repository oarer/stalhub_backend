import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'
import {
	normalizeUnoRoute,
	unoUpstreamErrorsTotal,
	unoUpstreamRequestDurationSeconds,
	unoUpstreamRequestsTotal,
} from '@/app/api/metrics'
import { UnoApiError, unoService } from '@/app/api/uno/service'
import { env } from '@/env'

interface MetricSnapshot {
	values: Array<{
		labels?: Record<string, unknown>
		value: number
		metricName?: string
	}>
}

async function metricValue(
	metric: { get(): Promise<MetricSnapshot> },
	labels: Record<string, string>,
	metricName?: string
): Promise<number> {
	const snapshot = await metric.get()
	const found = snapshot.values.find(
		(entry) =>
			(metricName === undefined || entry.metricName === metricName) &&
			Object.entries(labels).every(
				([key, value]) => String(entry.labels?.[key]) === value
			)
	)
	return found?.value ?? 0
}

function histogramCount(route: string): Promise<number> {
	return metricValue(
		unoUpstreamRequestDurationSeconds,
		{ route },
		'uno_upstream_request_duration_seconds_count'
	)
}

const originalFetch = globalThis.fetch

function stubFetch(handler: () => Promise<Response>) {
	globalThis.fetch = mock(handler) as unknown as typeof fetch
}

beforeAll(() => {
	env.UNO_API_TOKEN ??= 'test-token'
})

afterEach(() => {
	globalThis.fetch = originalFetch
})

describe('normalizeUnoRoute', () => {
	test('keeps static top-level routes as-is', () => {
		expect(normalizeUnoRoute('/health')).toBe('/health')
		expect(normalizeUnoRoute('/player-session')).toBe('/player-session')
		expect(normalizeUnoRoute('/calendar')).toBe('/calendar')
		expect(normalizeUnoRoute('/coverage')).toBe('/coverage')
		expect(normalizeUnoRoute('/leaderboard')).toBe('/leaderboard')
		expect(normalizeUnoRoute('/seasons')).toBe('/seasons')
		expect(normalizeUnoRoute('/rules')).toBe('/rules')
	})

	test('collapses player nicknames', () => {
		expect(normalizeUnoRoute('/players')).toBe('/players')
		expect(normalizeUnoRoute('/players/Bloodseeker')).toBe(
			'/players/:nickname'
		)
		expect(
			normalizeUnoRoute(
				'/players/very-long-nickname-over-sixteen-chars/gear'
			)
		).toBe('/players/:nickname/gear')
	})

	test('collapses clan ids and known sub-actions', () => {
		const clanId = '0b7f7a58-5a1c-4d2f-9f8a-2b3c4d5e6f70'
		expect(normalizeUnoRoute('/clans')).toBe('/clans')
		expect(normalizeUnoRoute(`/clans/${clanId}`)).toBe('/clans/:clan_id')
		expect(normalizeUnoRoute(`/clans/${clanId}/history`)).toBe(
			'/clans/:clan_id/history'
		)
		expect(normalizeUnoRoute(`/clans/${clanId}/analytics`)).toBe(
			'/clans/:clan_id/analytics'
		)
		expect(normalizeUnoRoute(`/clans/${clanId}/rating-history`)).toBe(
			'/clans/:clan_id/rating-history'
		)
		const opponentId = '11111111-2222-4333-8444-555555555555'
		expect(normalizeUnoRoute(`/clans/${clanId}/vs/${opponentId}`)).toBe(
			'/clans/:clan_id/vs/:opponent_id'
		)
	})

	test('collapses grid ids, exports and group numbers', () => {
		expect(normalizeUnoRoute('/grids')).toBe('/grids')
		expect(normalizeUnoRoute('/grids/some-grid-id')).toBe('/grids/:grid_id')
		expect(normalizeUnoRoute('/grids/some-grid-id/export')).toBe(
			'/grids/:grid_id/export'
		)
		expect(normalizeUnoRoute('/grids/some-grid-id/groups/3')).toBe(
			'/grids/:grid_id/groups/:number'
		)
	})

	test('keeps auction lots', () => {
		expect(normalizeUnoRoute('/auction/lots')).toBe('/auction/lots')
	})

	test('normalizes unknown route families with bounded placeholders', () => {
		expect(
			normalizeUnoRoute('/future/123e4567-e89b-12d3-a456-426614174000')
		).toBe('/future/:uuid')
		expect(normalizeUnoRoute('/future/42')).toBe('/future/:number')
		expect(normalizeUnoRoute(`/future/${'a'.repeat(16)}`)).toBe(
			'/future/:param'
		)
		expect(normalizeUnoRoute('/future/sub')).toBe('/future/sub')
	})

	test('falls back to unknown for unnormalizable paths', () => {
		expect(normalizeUnoRoute('')).toBe('unknown')
		expect(normalizeUnoRoute('not-a-path')).toBe('unknown')
		expect(normalizeUnoRoute('/players/a/b/c')).toBe('unknown')
		expect(normalizeUnoRoute('/players/Tester/unknown-suffix')).toBe(
			'unknown'
		)
		expect(normalizeUnoRoute('/clans/x/bogus')).toBe('unknown')
		expect(normalizeUnoRoute('/clans/x/vs')).toBe('unknown')
		expect(normalizeUnoRoute('/grids/x/groups/not-a-number')).toBe(
			'unknown'
		)
		expect(normalizeUnoRoute('/auction/other')).toBe('unknown')
		expect(normalizeUnoRoute('/health/extra')).toBe('unknown')
		expect(normalizeUnoRoute('/x'.repeat(10))).toBe('unknown')
		expect(normalizeUnoRoute('/future/John Doe!short-raw-user-input')).toBe(
			'/future/:param'
		)
		expect(normalizeUnoRoute(`/${'x'.repeat(16)}/sub`)).toBe('unknown')
	})
})

describe('unoService upstream metrics', () => {
	test('records ok status and duration for successful calls', async () => {
		stubFetch(() =>
			Promise.resolve(
				new Response(JSON.stringify({ name: 'Tester' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
			)
		)

		const route = '/players/:nickname'
		const okBefore = await metricValue(unoUpstreamRequestsTotal, {
			route,
			status: 'ok',
		})
		const httpErrorBefore = await metricValue(unoUpstreamErrorsTotal, {
			route,
			kind: 'http_error',
		})
		const countBefore = await histogramCount(route)

		await expect(unoService.request('/players/Tester')).resolves.toEqual({
			name: 'Tester',
		})

		expect(
			await metricValue(unoUpstreamRequestsTotal, { route, status: 'ok' })
		).toBe(okBefore + 1)
		expect(
			await metricValue(unoUpstreamErrorsTotal, {
				route,
				kind: 'http_error',
			})
		).toBe(httpErrorBefore)
		expect(await histogramCount(route)).toBe(countBefore + 1)
	})

	test('records http_error kind and status code for HTTP errors', async () => {
		stubFetch(() =>
			Promise.resolve(
				new Response(JSON.stringify({ error: 'nope' }), { status: 500 })
			)
		)

		const route = '/players/:nickname'
		const statusBefore = await metricValue(unoUpstreamRequestsTotal, {
			route,
			status: '500',
		})
		const kindBefore = await metricValue(unoUpstreamErrorsTotal, {
			route,
			kind: 'http_error',
		})

		const error = await unoService
			.request('/players/Tester')
			.catch((caught: unknown) => caught)

		expect(error).toBeInstanceOf(UnoApiError)
		expect((error as UnoApiError).status).toBe(500)
		expect(
			await metricValue(unoUpstreamRequestsTotal, {
				route,
				status: '500',
			})
		).toBe(statusBefore + 1)
		expect(
			await metricValue(unoUpstreamErrorsTotal, {
				route,
				kind: 'http_error',
			})
		).toBe(kindBefore + 1)
	})

	test('records timeout kind when fetch times out', async () => {
		const timeoutError = new Error('The operation was timed out')
		timeoutError.name = 'TimeoutError'
		stubFetch(() => Promise.reject(timeoutError))

		const route = '/players/:nickname'
		const statusBefore = await metricValue(unoUpstreamRequestsTotal, {
			route,
			status: 'timeout',
		})
		const kindBefore = await metricValue(unoUpstreamErrorsTotal, {
			route,
			kind: 'timeout',
		})

		const error = await unoService
			.request('/players/Tester')
			.catch((caught: unknown) => caught)

		expect(error).toBeInstanceOf(UnoApiError)
		expect((error as UnoApiError).status).toBe(504)
		expect(
			await metricValue(unoUpstreamRequestsTotal, {
				route,
				status: 'timeout',
			})
		).toBe(statusBefore + 1)
		expect(
			await metricValue(unoUpstreamErrorsTotal, {
				route,
				kind: 'timeout',
			})
		).toBe(kindBefore + 1)
	})

	test('records aborted kind when the caller aborts', async () => {
		const abortError = new Error('The operation was aborted')
		abortError.name = 'AbortError'
		stubFetch(() => Promise.reject(abortError))

		const route = '/clans/:clan_id'
		const statusBefore = await metricValue(unoUpstreamRequestsTotal, {
			route,
			status: 'aborted',
		})

		const error = await unoService
			.request('/clans/some-clan')
			.catch((caught: unknown) => caught)

		expect(error).toBeInstanceOf(UnoApiError)
		expect((error as UnoApiError).status).toBe(503)
		expect(
			await metricValue(unoUpstreamRequestsTotal, {
				route,
				status: 'aborted',
			})
		).toBe(statusBefore + 1)
	})

	test('records network kind for connection failures', async () => {
		stubFetch(() => Promise.reject(new TypeError('fetch failed')))

		const route = '/seasons'
		const statusBefore = await metricValue(unoUpstreamRequestsTotal, {
			route,
			status: 'network',
		})

		const error = await unoService
			.request('/seasons')
			.catch((caught: unknown) => caught)

		expect(error).toBeInstanceOf(UnoApiError)
		expect((error as UnoApiError).status).toBe(502)
		expect(
			await metricValue(unoUpstreamRequestsTotal, {
				route,
				status: 'network',
			})
		).toBe(statusBefore + 1)
	})

	test('records too_large kind for oversized responses', async () => {
		stubFetch(() =>
			Promise.resolve(
				new Response('truncated', {
					status: 200,
					headers: { 'content-length': '999999999999' },
				})
			)
		)

		const route = '/leaderboard'
		const statusBefore = await metricValue(unoUpstreamRequestsTotal, {
			route,
			status: 'too_large',
		})

		const error = await unoService
			.request('/leaderboard')
			.catch((caught: unknown) => caught)

		expect(error).toBeInstanceOf(UnoApiError)
		expect((error as UnoApiError).status).toBe(502)
		expect(
			await metricValue(unoUpstreamRequestsTotal, {
				route,
				status: 'too_large',
			})
		).toBe(statusBefore + 1)
	})

	test('does not record metrics when UNO is not configured', async () => {
		const url = env.UNO_API_URL
		const token = env.UNO_API_TOKEN
		env.UNO_API_TOKEN = ''

		const requestsBefore = await metricValue(unoUpstreamRequestsTotal, {
			route: '/players/:nickname',
			status: 'ok',
		})

		const error = await unoService
			.request('/players/Tester')
			.catch((caught: unknown) => caught)

		expect(error).toBeInstanceOf(UnoApiError)
		expect((error as UnoApiError).status).toBe(503)
		expect(
			await metricValue(unoUpstreamRequestsTotal, {
				route: '/players/:nickname',
				status: 'ok',
			})
		).toBe(requestsBefore)

		env.UNO_API_URL = url
		env.UNO_API_TOKEN = token
	})
})
