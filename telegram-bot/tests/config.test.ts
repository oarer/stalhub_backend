import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config'

const baseEnv = { TG_BOT_TOKEN: 'test-token' }

describe('config', () => {
	test('defaults the web app url to the production site', () => {
		expect(loadConfig(baseEnv).webAppUrl).toBe('https://stalhub.dev')
	})

	test('strips trailing slashes and query-safe parts from the web app url', () => {
		expect(
			loadConfig({ ...baseEnv, TG_WEBAPP_URL: 'https://stalhub.dev/' })
				.webAppUrl
		).toBe('https://stalhub.dev')
	})

	test('allows http only for local development hosts', () => {
		expect(
			loadConfig({ ...baseEnv, TG_WEBAPP_URL: 'http://localhost:3000' })
				.webAppUrl
		).toBe('http://localhost:3000')
		expect(() =>
			loadConfig({ ...baseEnv, TG_WEBAPP_URL: 'http://stalhub.dev' })
		).toThrow('TG_WEBAPP_URL must be an https:// URL')
	})

	test('defaults image service url and session ttl', () => {
		const config = loadConfig(baseEnv)
		expect(config.imageServiceUrl).toBe('http://localhost:3002')
		expect(config.sessionTtlMs).toBe(10 * 60 * 1000)
	})

	test('reads image service url and session ttl from env', () => {
		const config = loadConfig({
			...baseEnv,
			TG_IMAGE_SERVICE_URL: 'http://image-service:3002/',
			TG_SESSION_TTL_MINUTES: '15',
		})
		expect(config.imageServiceUrl).toBe('http://image-service:3002')
		expect(config.sessionTtlMs).toBe(15 * 60 * 1000)
	})
})
