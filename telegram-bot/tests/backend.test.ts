import { describe, expect, test } from 'bun:test'
import { fetchProfile } from '../src/backend'
import { loadConfig } from '../src/config'

describe('backend requests', () => {
	test('keeps the v1 player endpoint and encodes the character', async () => {
		const urls: string[] = []
		const fetchImpl = (async (input: RequestInfo | URL) => {
			urls.push(String(input))
			return new Response(
				JSON.stringify({ username: 'Nick Name', stats: [] }),
				{
					headers: { 'content-type': 'application/json' },
				}
			)
		}) as typeof fetch

		await fetchProfile(
			{
				backendUrl: 'https://backend.example/api/v1',
				requestTimeoutMs: 4_500,
			},
			'RU',
			'Nick Name',
			fetchImpl
		)

		expect(urls).toEqual([
			'https://backend.example/api/v1/player/RU/Nick%20Name',
		])
	})

	test('uses a short default request timeout', () => {
		const config = loadConfig({
			TG_BOT_TOKEN: 'test-token',
			BACKEND_URL: 'https://backend.example',
		})

		expect(config.backendUrl).toBe('https://backend.example/api/v1')
		expect(config.requestTimeoutMs).toBeLessThanOrEqual(5_000)
		expect(config.searchDebounceMs).toBe(250)
	})

	test('loads a positive search debounce override', () => {
		const config = loadConfig({
			TG_BOT_TOKEN: 'test-token',
			TG_SEARCH_DEBOUNCE_MS: '400',
		})

		expect(config.searchDebounceMs).toBe(400)
	})
})
