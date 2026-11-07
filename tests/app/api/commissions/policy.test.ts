import { describe, expect, test } from 'bun:test'
import {
	CommissionError,
	canRate,
	futureDate,
	money,
	participant,
	paymentPlan,
	priceTotal,
	refundAvailable,
} from '@/app/api/commissions/policy'
import {
	commandSchema,
	createSchema,
	profileSchema,
} from '@/app/api/commissions/schemas'

describe('commission policy', () => {
	test('money is positive integer minor units, bounded and without floating point', () => {
		for (const amount of [0, -1, 1.5, NaN, Infinity, 100_000_001])
			expect(() => money(amount)).toThrow(CommissionError)
		expect(priceTotal([{ amount: 101 }, { amount: 202 }])).toBe(303)
		expect(() =>
			priceTotal([{ amount: 100_000_000 }, { amount: 1 }])
		).toThrow()
		expect(() => priceTotal([])).toThrow()
	})
	test('payment stages add up exactly and have a prepayment', () => {
		expect(() =>
			paymentPlan(300, [
				{ amount: 100, upfront: true },
				{ amount: 200, upfront: false },
			])
		).not.toThrow()
		expect(() =>
			paymentPlan(300, [{ amount: 299, upfront: true }])
		).toThrow()
		expect(() =>
			paymentPlan(300, [{ amount: 300, upfront: false }])
		).toThrow()
	})
	test('refunds reserve confirmed money only', () => {
		expect(
			refundAvailable(
				[
					{ amount: 100, status: 'RECEIVED' },
					{ amount: 200, status: 'SENT' },
				],
				[{ amount: 30 }]
			)
		).toBe(70)
	})
	test('only the artist of a completed undisputed order can rate', () => {
		const order = { artist_id: 1, customer_id: 2, status: 'COMPLETED' }
		expect(canRate(order, 1, false)).toBe(true)
		expect(canRate(order, 2, false)).toBe(false)
		expect(canRate(order, 3, false)).toBe(false)
		expect(canRate(order, 1, true)).toBe(false)
		expect(canRate({ ...order, status: 'DECLINED' }, 1, false)).toBe(false)
		expect(participant(order, 3)).toBe(false)
	})
	test('deadlines must be real future dates', () => {
		expect(() => futureDate('not-a-date')).toThrow()
		expect(() => futureDate('2020-01-01')).toThrow()
		expect(
			futureDate(new Date(Date.now() + 86400000).toISOString())
		).toBeInstanceOf(Date)
	})
	test('schemas reject invalid scores, unbounded uploads and missing brief', () => {
		expect(
			commandSchema.safeParse({
				key: 'x',
				version: 1,
				action: 'review',
				score: 6,
			}).success
		).toBe(false)
		expect(
			commandSchema.safeParse({
				key: 'x',
				version: 1,
				action: 'message',
				file_ids: Array(11).fill('x'),
			}).success
		).toBe(false)
		expect(
			createSchema.safeParse({
				key: 'x',
				artist_id: 1,
				profile_version: 1,
				price_ids: ['x'],
				title: 'x',
				brief: '',
				file_ids: [],
			}).success
		).toBe(false)
		expect(
			profileSchema.safeParse({
				version: 0,
				description: '',
				accepting: false,
				currency: 'AAA',
				terms: '',
				revisions: 0,
				portfolio_ids: [],
				prices: [],
			}).success
		).toBe(false)
	})
})
