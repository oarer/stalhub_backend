import { describe, expect, test } from 'bun:test'
import catalog from '../src/stat-catalog.json'
import {
	CATEGORIES,
	categoryMeta,
	categoryStatsText,
	clanHistoryCaption,
	clanHistoryText,
	collectCategoryStats,
	formatStatValue,
	renderCategoryStatsSvg,
	renderMainStatsSvg,
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

	test('clanHistoryCaption stays under 1024 characters and truncates', () => {
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
		const caption = clanHistoryCaption(longProfile)
		expect(caption.length).toBeLessThanOrEqual(1024)
	})
})

describe('svg renderers', () => {
	test('main card includes player name and headline stats', () => {
		const svg = renderMainStatsSvg(SAMPLE_PROFILE)
		expect(svg).toContain('width="1200"')
		expect(svg).toContain('height="630"')
		expect(svg).toContain('>Nick</text>')
		expect(svg).toContain('K/D')
		expect(svg).toContain('Общая статистика')
	})

	test('main card escapes XML special characters in values', () => {
		const svg = renderMainStatsSvg({
			username: 'A<"&">B',
			stats: [],
		})
		expect(svg).not.toMatch(/(?<!&)lt;/)
		expect(svg).toContain('&lt;')
	})

	test('category card switches to three columns for long lists', () => {
		const sessionCategory = categoryMeta('session')!
		const allSessionStats = (
			catalog as Array<{
				id: string
				category: string
				type: string
				ru: string
			}>
		)
			.filter((stat) => stat.category === 'SESSION_MODES')
			.map((stat) => ({ id: stat.id, value: 1 }))
		const svg = renderCategoryStatsSvg(
			{ username: 'Nick', stats: allSessionStats },
			sessionCategory
		)
		expect(allSessionStats.length).toBeGreaterThan(12)
		expect(svg.match(/<rect x="/g)?.length).toBe(allSessionStats.length)
	})

	test('category card renders label and values', () => {
		const svg = renderCategoryStatsSvg(
			SAMPLE_PROFILE,
			categoryMeta('combat')!
		)
		expect(svg).toContain('>Боёвка<')
	})
})
