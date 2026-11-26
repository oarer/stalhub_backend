import { describe, expect, test } from 'bun:test'
import {
	normalizePlayerName,
	normalizePlayerQuery,
	topPlayerNominees,
} from '@/app/api/awards/player-top'

describe('award player helpers', () => {
	test('normalizes and validates nicknames', () => {
		expect(normalizePlayerName('  Oarer  ')).toBe('Oarer')
		expect(normalizePlayerName('pink  poffinz')).toBe('pink poffinz')
		expect(normalizePlayerName('')).toBeNull()
		expect(normalizePlayerName('a'.repeat(65))).toBeNull()
		expect(normalizePlayerName('bad/name')).toBeNull()
		expect(normalizePlayerName('ник_на_русском')).toBe('ник_на_русском')
	})

	test('requires at least two characters for search queries', () => {
		expect(normalizePlayerQuery(' o ')).toBeNull()
		expect(normalizePlayerQuery(' oa ')).toBe('oa')
	})

	test('keeps the leading players and shuffles their order', () => {
		const items = [
			{ id: 'a', votes: 1 },
			{ id: 'b', votes: 9 },
			{ id: 'c', votes: 5 },
			{ id: 'd', votes: 0 },
		]
		const top = topPlayerNominees(items, 2, () => 0.5)
		expect(top.map((row) => row.id).sort()).toEqual(['b', 'c'])
	})

	test('never exposes the vote order as ranking', () => {
		const items = [
			{ id: 'a', votes: 3 },
			{ id: 'b', votes: 2 },
			{ id: 'c', votes: 1 },
		]
		const orders = new Set<string>()
		for (let seed = 0; seed < 20; seed++)
			orders.add(
				topPlayerNominees(items, 10, () => seed / 20)
					.map((row) => row.id)
					.join('')
			)
		expect(orders.size).toBeGreaterThan(1)
	})

	test('clamps a non-positive limit', () => {
		expect(
			topPlayerNominees([{ id: 'a', votes: 1 }], -1, () => 0)
		).toEqual([])
	})
})
