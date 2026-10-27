import { describe, expect, test } from 'bun:test'
import { limitFormattable } from '../src/format'
import {
	CATEGORIES,
	categoryMeta,
	categoryStatsText,
	clanHistoryText,
	collectCategoryStats,
	formatStatValue,
} from '../src/stat-view'

type RawStat = { id: string; type?: string; value: unknown }

const SAMPLE_STATS: RawStat[] = [
	{ id: 'kil', value: 1234 },
	{ id: 'bul-dea', value: 500 },
	{ id: 'kills-bf', value: 100 },
	{ id: 'deaths-bf', value: 40 },
	{ id: 'pla-tim', value: 7_200_000 },
	{ id: 'sho-hit', value: 300 },
	{ id: 'sho-fir', value: 1000 },
	{ id: 'reg-tim', value: '2024-05-17T03:04:05.000Z' },
	{ id: 'dis-all', value: 250_000 },
	{ id: 'foo-eat', value: 3 },
	{ id: 'out-cra', value: 12 },
]

const SAMPLE_PROFILE = {
	username: 'Nick',
	alliance: 'duty',
	stats: SAMPLE_STATS,
	clan: { info: { name: 'Восход', tag: 'VSH' } },
	clan_history: [
		{
			id: 1,
			player_name: 'Nick',
			region: 'RU',
			clan_id: 'c1',
			clan_name: 'Восход',
			clan_tag: 'VSH',
			alliance: 'duty',
			rank: 'leader',
			joined_at: '2024-01-02T00:00:00.000Z',
			seen_at: '2024-06-01T00:00:00.000Z',
		},
	],
}

describe('formatStatValue', () => {
	test('formats integers with ru-RU grouping', () => {
		expect(formatStatValue(1234567, { id: 'kil', type: 'INTEGER' })).toBe(
			'1\u00a0234\u00a0567'
		)
	})

	test('formats duration in hours', () => {
		expect(
			formatStatValue(7_200_000, { id: 'pla-tim', type: 'DURATION' })
		).toBe('2 ч.')
	})

	test('formats distance decimals as kilometers', () => {
		expect(
			formatStatValue(250_000, { id: 'dis-all', type: 'DECIMAL' })
		).toBe('2,50 км')
	})

	test('uses explicit decimal config for known ids', () => {
		expect(formatStatValue(3, { id: 'foo-eat', type: 'DECIMAL' })).toBe(
			'3,00 кг'
		)
	})

	test('formats dates in ru-RU', () => {
		expect(
			formatStatValue('2024-05-17T03:04:05.000Z', {
				id: 'reg-tim',
				type: 'DATE',
			})
		).toBe('17.05.2024')
	})

	test('returns em-dashes for missing or broken values', () => {
		expect(formatStatValue(null, { id: 'kil', type: 'INTEGER' })).toBe('—')
		expect(formatStatValue('nope', { id: 'kil', type: 'DECIMAL' })).toBe(
			'—'
		)
		expect(
			formatStatValue('not-a-date', { id: 'reg-tim', type: 'DATE' })
		).toBe('not-a-date')
	})
})

describe('categories', () => {
	test('exposes six categories with unique callback keys', () => {
		expect(CATEGORIES.map((category) => category.key)).toEqual([
			'combat',
			'survival',
			'exploration',
			'session',
			'economy',
			'hideout',
		])
	})

	test('resolves category meta by key and name', () => {
		expect(categoryMeta('combat')?.label).toBe('Боёвка')
		expect(categoryMeta('unknown')).toBeNull()
	})

	test('collectCategoryStats only returns stats present in profile', () => {
		const combat = categoryMeta('combat')!
		const collected = collectCategoryStats(SAMPLE_PROFILE, combat)
		expect(collected.length).toBeGreaterThan(0)
		expect(
			collected.every((cell) =>
				SAMPLE_STATS.some((s) => s.id === cell.meta.id)
			)
		).toBe(true)
	})

	test('collectCategoryStats skips stats missing from the profile', () => {
		const sessionCategory = categoryMeta('session')!
		expect(
			collectCategoryStats(
				{ username: 'Nick', stats: [] },
				sessionCategory
			)
		).toEqual([])
	})
})

describe('text renderers', () => {
	test('categoryStatsText includes title and values', () => {
		const text = categoryStatsText(SAMPLE_PROFILE, categoryMeta('combat')!)
		expect(text.text).toContain('Боёвка | Nick')
		expect(text.text).not.toContain('undefined')
	})

	test('clanHistoryText lists clan entries', () => {
		const text = clanHistoryText(SAMPLE_PROFILE)
		expect(text.text).toContain('История кланов | Nick')
		expect(text.text).toContain('Восход [VSH]')
		expect(text.text).toContain('Лидер')
	})

	test('clanHistoryText is bounded to 4096 characters by limitFormattable', () => {
		const longProfile = {
			...SAMPLE_PROFILE,
			clan_history: Array.from({ length: 100 }, (_, index) => ({
				id: index,
				player_name: 'Nick',
				region: 'RU',
				clan_id: `clan-${index}`,
				clan_name: `Клан ${'х'.repeat(120)}`,
				clan_tag: 'TAG',
				alliance: 'duty',
				rank: 'soldier',
				joined_at: null,
				seen_at: '2025-06-07T03:04:05.000Z',
			})),
		}
		const text = limitFormattable(clanHistoryText(longProfile))
		expect(text.text.length).toBeLessThanOrEqual(4096)
	})
})
