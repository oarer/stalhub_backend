import { describe, expect, test } from 'bun:test'
import { UNO_DATE_OR_DATETIME_PATTERN } from '@/app/api/uno/query-schema'

const PATTERN = new RegExp(UNO_DATE_OR_DATETIME_PATTERN)

describe('UNO_DATE_OR_DATETIME_PATTERN', () => {
	test('accepts plain dates and ISO datetimes produced by upstream', () => {
		expect(PATTERN.test('2026-08-06')).toBe(true)
		expect(PATTERN.test('2026-08-06T00:00:00')).toBe(true)
		expect(PATTERN.test('2026-08-06T00:00:00.000Z')).toBe(true)
		expect(PATTERN.test('2026-08-06T00:00:00+03:00')).toBe(true)
		expect(PATTERN.test('2026-08-06T00:00')).toBe(true)
		expect(PATTERN.test('2026-08-06 00:00:00')).toBe(true)
		expect(PATTERN.test('2026-08-06T23:59:59+0300')).toBe(true)
	})

	test('rejects obvious junk', () => {
		expect(PATTERN.test('')).toBe(false)
		expect(PATTERN.test('banana')).toBe(false)
		expect(PATTERN.test('2026-8-6')).toBe(false)
		expect(PATTERN.test('26/august')).toBe(false)
	})
})
