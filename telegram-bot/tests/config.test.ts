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
})
