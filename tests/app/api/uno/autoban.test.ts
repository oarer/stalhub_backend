import { describe, expect, test } from 'bun:test'
import { env } from '@/env'
import { shouldBlockForViolations, unoErrorStatus } from '@/utils/auto-ban/uno'

describe('UNO autoban thresholds', () => {
	test('shouldBlockForViolations blocks only above threshold', () => {
		expect(shouldBlockForViolations(0, 20)).toBe(false)
		expect(shouldBlockForViolations(20, 20)).toBe(false)
		expect(shouldBlockForViolations(21, 20)).toBe(true)
		expect(shouldBlockForViolations(1000, 20)).toBe(true)
	})

	test('shouldBlockForViolations is disabled when threshold is 0', () => {
		expect(shouldBlockForViolations(999, 0)).toBe(false)
		expect(shouldBlockForViolations(999, -1)).toBe(false)
	})

	test('shouldBlockForViolations ignores non-numeric counts', () => {
		expect(
			shouldBlockForViolations(Number('abc') as unknown as number, 20)
		).toBe(false)
	})

	test('unoErrorStatus coerces numeric statuses and rejects others', () => {
		expect(unoErrorStatus(403)).toBe(403)
		expect(unoErrorStatus('414')).toBe(414)
		expect(unoErrorStatus(undefined)).toBe(0)
		expect(unoErrorStatus('Forbidden')).toBe(0)
		expect(unoErrorStatus({})).toBe(0)
	})

	test('env defaults match the documented thresholds', () => {
		expect(env.UNO_ABUSE_WINDOW_SECONDS).toBe(60)
		expect(env.UNO_ABUSE_MAX_VIOLATIONS).toBe(20)
	})
})
