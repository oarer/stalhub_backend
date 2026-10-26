import { describe, expect, test } from 'bun:test'
import { BackendError } from '../src/backend'
import { buildInlineResults, isNotFound } from '../src/inline'
import type { Region } from '../src/query'

describe('inline results', () => {
	test('returns a hint for an empty query', async () => {
		const results = await buildInlineResults('', async () => {
			throw new Error('must not lookup')
		})
		expect(results).toHaveLength(1)
		expect(results[0].title).toBe('Поиск игрока')
		expect(results[0].description).toContain('Введите имя персонажа')
		expect(results[0].input_message_content.message_text).toContain(
			'Введите имя персонажа'
		)
	})

	test('distinguishes a not found backend error from an infrastructure error', () => {
		expect(isNotFound(new BackendError(404))).toBe(true)
		expect(isNotFound(new BackendError(502))).toBe(false)
	})

	test('keeps successful regions when another region returns 404', async () => {
		const results = await buildInlineResults(
			'Nick',
			async (region: Region) => {
				if (region === 'EU') throw new BackendError(404)
				return { username: `Nick-${region}`, stats: [] }
			}
		)
		expect(results.map((result) => result.title)).toEqual([
			'Nick-RU (RU)',
			'Nick-NA (NA)',
			'Nick-SEA (SEA)',
			'Nick-NEA (NEA)',
		])
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

		expect(content.parse_mode).toBe('HTML')
		expect(content.message_text).toContain('История кланов:')
		expect(content.message_text).toContain('<blockquote expandable>')
		expect(content.message_text).toContain(
			'Former Clan [OLD] · Member · RU · 02.01.2024'
		)
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
			'Регион: <b>RU</b>'
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

	test('propagates the web app url into profile card keyboards', async () => {
		const results = await buildInlineResults(
			'Nick RU',
			async () => ({ username: 'Nick', stats: [] }),
			{ webAppUrl: 'https://stalhub.dev' }
		)
		const buttons = results[0].reply_markup?.inline_keyboard.flat() ?? []
		expect(
			buttons.some(
				(button) =>
					button.web_app?.url === 'https://stalhub.dev/player/RU/Nick'
			)
		).toBe(true)

		const withoutApp = await buildInlineResults('Nick RU', async () => ({
			username: 'Nick',
			stats: [],
		}))
		expect(
			(withoutApp[0].reply_markup?.inline_keyboard.flat() ?? []).some(
				(button) => button.web_app
			)
		).toBe(false)
	})
})
