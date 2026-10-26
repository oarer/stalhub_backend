import { describe, expect, test } from 'bun:test'
import { BackendError } from '../src/backend'
import { buildInlineResults, isNotFound } from '../src/inline'
import { type ItemLookup, parseListing } from '../src/items'
import type { Region } from '../src/query'

const dbUrl = 'https://cdn.stalhub.dev/db'
const items = parseListing(
	[
		{
			data: '/items/other/qyvk.json',
			icon: '/icons/other/qyvk.png',
			name: { ru: '«Вспышка»', en: 'Flare' },
			color: 'RANK_MASTER',
		},
	],
	{ dbUrl, webAppUrl: 'https://stalhub.dev' }
)

const itemLookup: ItemLookup = {
	search: async (query) =>
		items
			.filter((item) =>
				item.name.ru?.toLowerCase().includes(query.toLowerCase())
			)
			.slice(0, 8),
}

describe('inline results', () => {
	test('returns a hint for an empty query', async () => {
		const results = await buildInlineResults('', async () => {
			throw new Error('must not lookup')
		})
		expect(results).toHaveLength(1)
		expect(results[0].title).toBe('Поиск StalHub')
		expect(results[0].description).toContain('Введите имя персонажа')
		expect(results[0].description).toContain('/i')
		expect(results[0].input_message_content.message_text).toContain(
			'Введите имя персонажа'
		)
	})

	test('distinguishes a not found backend error from an infrastructure error', () => {
		expect(isNotFound(new BackendError(404))).toBe(true)
		expect(isNotFound(new BackendError(502))).toBe(false)
	})

	test('looks up a single default region when region is omitted', async () => {
		const regions: Region[] = []
		await buildInlineResults('Nick', async (region) => {
			regions.push(region)
			return { username: 'Nick', stats: [] }
		})
		expect(regions).toEqual(['RU'])
	})

	test('returns not found when every region returns 404', async () => {
		const results = await buildInlineResults('Nick', async () => {
			throw new BackendError(404)
		})
		expect(results[0].title).toBe('Ошибка поиска')
		expect(results[0].description).toContain('не найден')
		expect(results[0].input_message_content.message_text).toContain(
			'не найден'
		)
	})

	test('returns not found for an explicit region 404', async () => {
		const results = await buildInlineResults('Nick RU', async () => {
			throw new BackendError(404)
		})
		expect(results[0].input_message_content.message_text).toContain(
			'не найден'
		)
	})

	test('renders backend clan history in the inline profile card', async () => {
		const results = await buildInlineResults('Nick RU', async () => ({
			username: 'Nick',
			stats: [],
			clan_history: [
				{
					id: 1,
					player_name: 'Nick',
					region: 'RU',
					clan_id: 'clan-1',
					clan_name: 'Former Clan',
					clan_tag: 'OLD',
					alliance: 'duty',
					rank: 'Member',
					joined_at: '2024-01-02T00:00:00.000Z',
					seen_at: '2025-01-02T00:00:00.000Z',
				},
			],
		}))
		const content = results[0].input_message_content

		expect(content.message_text).toContain('История кланов:')
		expect(content.message_text).toContain(
			'Former Clan [OLD] · Member · RU · 02.01.2024'
		)
		expect(
			(content.entities ?? []).some(
				(entity) => entity.type === 'expandable_blockquote'
			)
		).toBe(true)
		expect(content).not.toHaveProperty('rich_message')
	})

	test('looks up only the explicitly selected region', async () => {
		const regions: Region[] = []
		const results = await buildInlineResults('Nick ru ', async (region) => {
			regions.push(region)
			return { username: 'Nick', stats: [] }
		})

		expect(regions).toEqual(['RU'])
		expect(results[0].input_message_content.message_text).toContain(
			'Регион: RU'
		)
	})

	test('returns a backend error when every region fails with an infrastructure error', async () => {
		const results = await buildInlineResults('Nick', async () => {
			throw new BackendError(502)
		})
		expect(results[0].title).toBe('Ошибка поиска')
		expect(results[0].description).toContain('Не удалось получить данные')
		expect(results[0].input_message_content.message_text).toContain(
			'Не удалось получить данные'
		)
		expect(results[0].input_message_content.message_text).not.toContain(
			'не найден'
		)
	})

	test('returns a backend error for an explicit region failure', async () => {
		const results = await buildInlineResults('Nick RU', async () => {
			throw new BackendError(502)
		})
		expect(results[0].title).toBe('Ошибка поиска')
		expect(results[0].description).toContain('Не удалось получить данные')
		expect(results[0].input_message_content.message_text).toContain(
			'Не удалось получить данные'
		)
	})

	test('keeps error card ids short for long unknown regions', async () => {
		const longRegion = 'X'.repeat(1_000)
		const results = await buildInlineResults(
			`Nick ${longRegion}`,
			async () => {
				throw new Error('must not lookup')
			}
		)
		const repeated = await buildInlineResults(
			`Nick ${longRegion}`,
			async () => {
				throw new Error('must not lookup')
			}
		)
		expect(
			new TextEncoder().encode(results[0].id).byteLength
		).toBeLessThanOrEqual(64)
		expect(repeated[0].id).toBe(results[0].id)
	})
})

describe('inline item results', () => {
	test('returns item cards with rank, icon and page link', async () => {
		const results = await buildInlineResults(
			'/i вспышка',
			async () => {
				throw new Error('must not lookup')
			},
			itemLookup
		)
		expect(results.map((result) => result.title)).toEqual(['«Вспышка»'])
		expect(results[0].thumb_url).toBe(`${dbUrl}/icons/other/qyvk.png`)
		expect(results[0].description).toContain('Мастер')
		expect(results[0].input_message_content.message_text).toContain(
			'Ранг: Мастер'
		)
		expect(results[0].reply_markup?.inline_keyboard.at(-1)?.[0].url).toBe(
			'https://stalhub.dev/items/other/qyvk'
		)
		expect(results[0].reply_markup?.inline_keyboard[0]).toEqual([
			{ text: 'Характеристики', callback_data: 'item:other:qyvk' },
		])
	})

	test('returns not found hint for missing items', async () => {
		const results = await buildInlineResults(
			'/i болт',
			async () => {
				throw new Error('must not lookup')
			},
			itemLookup
		)
		expect(results).toHaveLength(1)
		expect(results[0].title).toBe('Ошибка поиска')
		expect(results[0].input_message_content.message_text).toContain(
			'не найден'
		)
	})
})
