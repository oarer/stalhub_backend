import { describe, expect, test } from 'bun:test'
import { parseInlineQuery } from '../src/query'

describe('parseInlineQuery', () => {
	test('searches every region when region is omitted', () => {
		expect(parseInlineQuery('Nick')).toEqual({
			kind: 'player',
			character: 'Nick',
			regions: ['RU', 'EU', 'NA', 'SEA', 'NEA'],
		})
	})

	test('parses explicit regions with case and punctuation variants', () => {
		for (const query of [
			'Nick RU',
			'Nick ru',
			'Nick RU ',
			'Nick (RU)',
			'Nick, RU',
		]) {
			expect(parseInlineQuery(query)).toEqual({
				kind: 'player',
				character: 'Nick',
				regions: ['RU'],
			})
		}
		expect(parseInlineQuery('@stalhub_bot Nick eu')).toEqual({
			kind: 'player',
			character: 'Nick',
			regions: ['EU'],
		})
	})

	test('reports empty and unknown region queries', () => {
		expect(parseInlineQuery('   ')).toEqual({ kind: 'empty' })
		const unknown = parseInlineQuery('Nick CIS')
		expect(unknown).toEqual({
			kind: 'error',
			message:
				'Неизвестный регион «CIS». Доступны: RU, EU, NA, SEA, NEA.',
		})
	})

	test('rejects names longer than 64 characters', () => {
		expect(parseInlineQuery('a'.repeat(64)).kind).toBe('player')
		expect(parseInlineQuery('a'.repeat(65)).kind).toBe('error')
		expect(parseInlineQuery('😀'.repeat(64)).kind).toBe('player')
		expect(parseInlineQuery('😀'.repeat(65)).kind).toBe('error')
	})
})
