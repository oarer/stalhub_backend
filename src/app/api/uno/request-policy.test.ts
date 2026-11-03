import { describe, expect, test } from 'bun:test'
import {
	isAllowedUnoOrigin,
	isAllowedUnoRequest,
	UNO_MAX_URL_LENGTH,
} from './request-policy'

describe('UNO request policy', () => {
	const allowedOrigins = ['https://stalhub.dev']

	test('allows StalHub origins and rejects lookalikes', () => {
		expect(isAllowedUnoOrigin('https://stalhub.dev', allowedOrigins)).toBe(
			true
		)
		expect(
			isAllowedUnoOrigin('https://app.stalhub.dev/path', allowedOrigins)
		).toBe(true)
		expect(
			isAllowedUnoOrigin('https://stalhub.dev.evil.test', allowedOrigins)
		).toBe(false)
	})

	test('allows server-side requests without browser origin headers', () => {
		expect(
			isAllowedUnoRequest(
				new Request('https://api.stalhub.dev/api/v1/uno/seasons'),
				allowedOrigins
			)
		).toBe(true)
	})

	test('rejects foreign origin and accepts StalHub referer', () => {
		expect(
			isAllowedUnoRequest(
				new Request('https://api.stalhub.dev/api/v1/uno/seasons', {
					headers: { Origin: 'https://example.test' },
				}),
				allowedOrigins
			)
		).toBe(false)
		expect(
			isAllowedUnoRequest(
				new Request('https://api.stalhub.dev/api/v1/uno/seasons', {
					headers: { Referer: 'https://stalhub.dev/uno' },
				}),
				allowedOrigins
			)
		).toBe(true)
	})

	test('keeps the shared URL ceiling explicit', () => {
		expect(UNO_MAX_URL_LENGTH).toBe(4096)
	})
})
