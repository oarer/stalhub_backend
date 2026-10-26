import { describe, expect, test } from 'bun:test'
import {
	bold,
	code,
	expandableBlockquote,
	type FormattableString,
	format,
} from 'gramio'
import { helpText, messageArticle, profileArticle } from '../src/format'

function entitiesOf(
	article: ReturnType<typeof profileArticle>
): FormattableString['entities'] {
	return article.input_message_content.entities ?? []
}

function textOf(article: ReturnType<typeof profileArticle>): string {
	return article.input_message_content.message_text
}

describe('Telegram formatting', () => {
	test('creates an article with a bold username, plain text and a profile button', () => {
		const result = profileArticle(
			{
				username: 'A<&',
				status: 'active',
				alliance: 'duty & honor',
				stats: [
					{ id: 'kil', value: 2 },
					{ id: 'bul-dea', value: 1 },
				],
			},
			'RU'
		)
		const text = textOf(result)
		expect(text).toContain('A<& (RU)')
		expect(text).toContain('Регион: RU')
		expect(text).toContain('Фракция: duty & honor')
		expect(text).not.toContain('Статус:')

		const usernameBold = entitiesOf(result).find(
			(entity) => entity.type === 'bold' && entity.offset === 0
		)
		expect(usernameBold?.length).toBe('A<&'.length)
		expect(result.reply_markup?.inline_keyboard[0][0].url).toContain(
			'/player/RU/A%3C%26'
		)
	})

	test('formats clan history as an expandable blockquote entity', () => {
		const result = profileArticle(
			{
				username: 'Nick',
				clan: { info: { name: 'Current', tag: 'NOW' } },
				clan_history: [
					{
						id: 1,
						player_name: 'Nick',
						region: 'EU',
						clan_id: 'old-id',
						clan_name: 'Old & Clan',
						clan_tag: 'OLD',
						alliance: 'duty',
						rank: 'Officer',
						joined_at: null,
						seen_at: '2025-06-07T03:04:05.000Z',
					},
				],
			},
			'RU'
		)
		const text = textOf(result)

		expect(text).toContain('История кланов:')
		expect(text).toContain('Old & Clan [OLD] · Офицер · EU · 07.06.2025')
		expect(text.indexOf('Клан:')).toBeLessThan(
			text.indexOf('История кланов:')
		)
		expect(result.input_message_content).not.toHaveProperty('rich_message')

		const blockquote = entitiesOf(result).find(
			(entity) => entity.type === 'expandable_blockquote'
		)
		expect(blockquote).toBeDefined()
		const quoted = text.slice(
			blockquote?.offset ?? 0,
			(blockquote?.offset ?? 0) + (blockquote?.length ?? 0)
		)
		expect(quoted.startsWith('\n')).toBe(false)
		expect(quoted.endsWith('\n')).toBe(false)
	})

	test('maps faction names case-insensitively and preserves unknown values', () => {
		for (const [alliance, expected] of [
			['merc', 'Наёмник'],
			['covenant', 'Завет'],
			['freedom', 'Заря'],
			['duty', 'Долг'],
			['bandits', 'Бандит'],
			['stalkers', 'Сталкер'],
			[' COVENANT ', 'Завет'],
			['new<&', 'new<&'],
			['', '—'],
		]) {
			const text = profileArticle({ username: 'Nick', alliance }, 'RU')
				.input_message_content.message_text
			expect(text).toContain(`Фракция: ${expected}\n`)
		}
		expect(
			profileArticle({ username: 'Nick' }, 'RU').input_message_content
				.message_text
		).toContain('Фракция: —\n')
	})

	test('maps clan ranks case-insensitively and preserves unknown values', () => {
		for (const [rank, expected] of [
			['LEADER', 'Лидер'],
			['COLONEL', 'Полковник'],
			['OFFICER', 'Офицер'],
			['SERGEANT', 'Сержант'],
			['SOLDIER', 'Боец'],
			['COMMONER', 'Запасной'],
			['RECRUIT', 'Рядовой'],
			[' officer ', 'Офицер'],
			['NEW<&', 'NEW<&'],
			['', '—'],
		]) {
			const text = profileArticle(
				{
					username: 'Nick',
					clan_history: [
						{
							id: 1,
							player_name: 'Nick',
							region: 'RU',
							clan_id: 'clan-1',
							clan_name: 'Clan',
							clan_tag: '',
							alliance: 'duty',
							rank,
							joined_at: null,
							seen_at: '2025-01-02T00:00:00.000Z',
						},
					],
				},
				'RU'
			).input_message_content.message_text
			expect(text).toContain(`Clan · ${expected} · RU`)
		}
	})

	test('omits empty clan history', () => {
		const result = profileArticle(
			{ username: 'Nick', clan_history: [] },
			'RU'
		)
		const text = result.input_message_content.message_text

		expect(text).not.toContain('История кланов:')
		expect(
			entitiesOf(result).some((entity) => entity.type === 'blockquote')
		).toBe(false)
	})

	test('formats help text with custom emoji, code and bold entities', () => {
		const help = helpText()
		expect(help.text).toContain('🦠 StalHub | Bot')
		expect(help.text).toContain('@StalhubBot ник [регион]')
		expect(help.text).toContain('@StalhubBot ник EU')
		expect(help.text).toContain('Поиск предметов')
		expect(help.text).toContain('@StalhubBot /i вспышка')
		expect(help.text).toContain('Без региона поиск выполняется в RU.')
		expect(help.text).toContain('🔗 Сайт можно открыть')

		const codeEntity = help.entities
			.filter((entity) => entity.type === 'code')
			.map((entity) =>
				help.text.slice(entity.offset, entity.offset + entity.length)
			)
		expect(codeEntity).toContain('@StalhubBot ник [регион]')

		const emojiIds = help.entities
			.filter((entity) => entity.type === 'custom_emoji')
			.map((entity) => entity.custom_emoji_id)
		expect(emojiIds).toContain('5345778951031658558')
		expect(emojiIds).toContain('6028171274939797252')
	})

	test('bounds text length and keeps a blockquote when truncating', () => {
		const result = profileArticle(
			{
				username: 'Nick',
				clan_history: Array.from({ length: 100 }, (_, index) => ({
					id: index,
					player_name: 'Nick',
					region: 'RU',
					clan_id: `clan-${index}`,
					clan_name: `Clan ${'x'.repeat(100)}`,
					clan_tag: 'TAG',
					alliance: 'duty',
					rank: 'Member',
					joined_at: null,
					seen_at: '2025-06-07T03:04:05.000Z',
				})),
			},
			'RU'
		)
		const text = textOf(result)

		expect(text.length).toBeLessThanOrEqual(4096)
		expect(text.endsWith('…')).toBe(true)
		const blockquote = entitiesOf(result).find(
			(entity) => entity.type === 'expandable_blockquote'
		)
		expect(blockquote).toBeDefined()
		expect(
			(blockquote?.offset ?? 0) + (blockquote?.length ?? 0)
		).toBeLessThanOrEqual(text.length)
	})

	test('bounds IDs and long plain content', () => {
		const longId = 'идентификатор-'.repeat(20)
		const profile = profileArticle(
			{
				username: 'Nick',
				status: 'danger',
				alliance: 'x&'.repeat(1_000),
			},
			'RU',
			longId
		)
		const message = messageArticle(
			'[status] & <tag> '.repeat(5_000),
			longId
		)

		expect(
			new TextEncoder().encode(profile.id).byteLength
		).toBeLessThanOrEqual(64)
		expect(
			new TextEncoder().encode(message.id).byteLength
		).toBeLessThanOrEqual(64)
		expect(
			profile.input_message_content.message_text.length
		).toBeLessThanOrEqual(4096)
		expect(
			message.input_message_content.message_text.length
		).toBeLessThanOrEqual(4096)
		expect(profile.input_message_content.message_text).not.toContain(
			'Статус:'
		)
		expect(message.input_message_content.message_text).toContain(
			'[status] & <tag>'
		)
		expect(message.input_message_content.entities).toBeUndefined()
	})

	test('builds formatting helpers expected by the bot', () => {
		const sample = format`Hi ${bold`there`} ${code`cmd`}`
		expect(sample.text).toBe('Hi there cmd')
		expect(sample.entities.map((entity) => entity.type)).toEqual([
			'bold',
			'code',
		])
		const quote = expandableBlockquote`line`
		expect(quote.text).toBe('line')
	})
})
