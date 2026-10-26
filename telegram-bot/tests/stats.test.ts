import { describe, expect, test } from 'bun:test'
import {
	extractMetrics,
	formatDate,
	formatHours,
	formatMetric,
} from '../src/stats'

describe('player metrics', () => {
	test('calculates requested ratios and time units', () => {
		const metrics = extractMetrics({
			username: 'Nick',
			stats: [
				{ id: 'kil', value: 12 },
				{ id: 'bul-dea', value: 4 },
				{ id: 'kills-bf', value: 9 },
				{ id: 'deaths-bf', value: 3 },
				{ id: 'pla-tim', value: 7_200_000 },
				{ id: 'reg-tim', value: '2024-01-02T00:00:00.000Z' },
				{ id: 'sho-hit', value: 25 },
				{ id: 'sho-fir', value: 100 },
			],
		})
		expect(metrics).toEqual({
			kd: 3,
			battleKd: 3,
			hours: 2,
			registeredAt: '2024-01-02T00:00:00.000Z',
			accuracy: 25,
		})
	})

	test('formats missing values safely', () => {
		expect(formatMetric(null)).toBe('—')
		expect(formatHours(null)).toBe('—')
		expect(formatDate(null)).toBe('—')
	})

	test('matches web rounding and zero-ratio behavior', () => {
		expect(formatHours(1.4)).toBe('1 ч.')
		expect(formatHours(1.6)).toBe('2 ч.')

		const metrics = extractMetrics({
			username: 'Nick',
			stats: [
				{ id: 'kil', value: 7 },
				{ id: 'bul-dea', value: 0 },
				{ id: 'kills-bf', value: 5 },
				{ id: 'deaths-bf', value: 0 },
			],
		})
		const zeroMetrics = extractMetrics({
			username: 'Nick',
			stats: [
				{ id: 'kil', value: 0 },
				{ id: 'bul-dea', value: 0 },
				{ id: 'kills-bf', value: 0 },
				{ id: 'deaths-bf', value: 0 },
			],
		})

		expect(metrics.kd).toBe(7)
		expect(metrics.battleKd).toBe(5)
		expect(zeroMetrics.kd).toBeNull()
		expect(zeroMetrics.battleKd).toBeNull()
		expect(formatMetric(zeroMetrics.kd)).toBe('—')
		expect(formatMetric(zeroMetrics.battleKd)).toBe('—')
	})
})
