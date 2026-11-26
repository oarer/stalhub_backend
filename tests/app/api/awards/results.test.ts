import { describe, expect, test } from 'bun:test'
import {
	computePlaces,
	qualifiesTie,
} from '../../../../src/app/api/admin/awards/results'

describe('awards result ranking', () => {
	test('uses standard competition ranking', () => {
		const rows = computePlaces([
			{ id: 'a', votes_count: 5, manual_place: null, place: null },
			{ id: 'b', votes_count: 3, manual_place: null, place: null },
			{ id: 'c', votes_count: 3, manual_place: null, place: null },
			{ id: 'd', votes_count: 1, manual_place: null, place: null },
		])
		expect(rows.map((row) => row.place)).toEqual([1, 2, 2, 4])
	})
	test('blocks first-place ties', () =>
		expect(
			qualifiesTie([
				{ id: 'a', votes_count: 5, manual_place: null, place: null },
				{ id: 'b', votes_count: 5, manual_place: null, place: null },
			])
		).not.toBeNull())
	test('does not block below-top-three or zero ties', () => {
		expect(
			qualifiesTie([
				{ id: 'a', votes_count: 5, manual_place: null, place: null },
				{ id: 'b', votes_count: 4, manual_place: null, place: null },
				{ id: 'c', votes_count: 3, manual_place: null, place: null },
				{ id: 'd', votes_count: 1, manual_place: null, place: null },
				{ id: 'e', votes_count: 1, manual_place: null, place: null },
			])
		).toBeNull()
		expect(
			qualifiesTie([
				{ id: 'a', votes_count: 0, manual_place: null, place: null },
				{ id: 'b', votes_count: 0, manual_place: null, place: null },
			])
		).toBeNull()
	})
	test('manual places override computed places', () =>
		expect(
			computePlaces([
				{ id: 'a', votes_count: 1, manual_place: 3, place: null },
			])[0].place
		).toBe(3))
})
