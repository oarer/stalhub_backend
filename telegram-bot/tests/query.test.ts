import { describe, expect, test } from 'bun:test'
import { parseInlineQuery } from '../src/query'

describe('parseInlineQuery', () => {
	test('defaults to RU when region is omitted', () => {
		expect(parseInlineQuery('Nick')).toEqual({
			kind: 'player',
			character: 'Nick',
			regions: ['RU'],
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

	test('parses item queries with /i, /item and /items aliases', () => {
		for (const query of [
			'/i вспышка',
			'/item «Вспышка»',
			'/items flare',
			'@stalhub_bot /i вспышка',
		]) {
			expect(parseInlineQuery(query)).toEqual({
				kind: 'item',
				name: query.replace(/^(@\S+\s+)?\/\S+/i, '').trim(),
			})
		}
		expect(parseInlineQuery('/i Мякоть солевика')).toEqual({
			kind: 'item',
			name: 'Мякоть солевика',
		})
	})

	test('reports missing names and overlong item names', () => {
		expect(parseInlineQuery('/i')).toEqual({
			kind: 'error',
			message: 'Укажите название предмета: @StalhubBot /i вспышка.',
		})
		expect(parseInlineQuery('/i ')).toEqual({
			kind: 'error',
			message: 'Укажите название предмета: @StalhubBot /i вспышка.',
		})
		expect(parseInlineQuery(`/I ${'a'.repeat(65)}`).kind).toBe('error')
	})
})
