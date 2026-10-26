import { describe, expect, test } from 'bun:test'
import {
	escapeHtml,
	helpText,
	messageArticle,
	profileArticle,
} from '../src/format'

function parsedTextLength(html: string): number {
	return html
		.replace(/<\/?(?:b|code|blockquote(?: expandable)?)>/g, '')
		.replace(/&(?:amp|lt|gt|quot);/g, 'x').length
}

describe('Telegram formatting', () => {
	test('escapes HTML text characters', () => {
		expect(escapeHtml('& <tag> "quoted"')).toBe(
			'&amp; &lt;tag&gt; &quot;quoted&quot;'
		)
	})

	test('creates an HTML article with a profile button and message text', () => {
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
		expect(result.input_message_content.parse_mode).toBe('HTML')
		expect(result.input_message_content.message_text).toContain(
			'<b>A&lt;&amp;</b> (RU)'
		)
		expect(result.input_message_content.message_text).toContain(
			'Регион: <b>RU</b>'
		)
		expect(result.input_message_content.message_text).toContain(
			'Фракция: duty &amp; honor'
		)
		expect(result.input_message_content.message_text).not.toContain(
			'Статус:'
		)
		expect(result.reply_markup?.inline_keyboard[0][0].url).toContain(
			'/player/RU/A%3C%26'
		)
	})

	test('formats clan history as expandable Telegram HTML', () => {
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
		const text = result.input_message_content.message_text

		expect(text).toContain('История кланов:')
		expect(text).toContain(
			'<blockquote expandable>Old &amp; Clan [OLD] · Офицер · EU · 07.06.2025</blockquote>'
		)
		expect(text).not.toContain('<blockquote expandable>\n')
		expect(text).not.toContain('\n</blockquote>')
		expect(text.indexOf('Клан:')).toBeLessThan(
			text.indexOf('История кланов:')
		)
		expect(result.input_message_content).not.toHaveProperty('rich_message')
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
			['new<&', 'new&lt;&amp;'],
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
			['NEW<&', 'NEW&lt;&amp;'],
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
		expect(text).not.toContain('<blockquote')
	})

	test('formats help text with HTML tags', () => {
		const text = helpText()
		expect(text).toContain('<b>StalHub | Bot</b>')
		expect(text).toContain('<code>@StalhubBot Nick EU</code>')
		expect(text).toContain('Без региона поиск выполняется в RU.')
	})

	test('closes an expandable history blockquote when truncating', () => {
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
		const text = result.input_message_content.message_text

		expect(parsedTextLength(text)).toBeLessThanOrEqual(4096)
		expect(text).toContain('<blockquote expandable>')
		expect(text.endsWith('</blockquote>')).toBe(true)
	})

	test('bounds IDs and long HTML content', () => {
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
			parsedTextLength(profile.input_message_content.message_text)
		).toBeLessThanOrEqual(4096)
		expect(
			parsedTextLength(message.input_message_content.message_text)
		).toBeLessThanOrEqual(4096)
		expect(profile.input_message_content.parse_mode).toBe('HTML')
		expect(message.input_message_content.parse_mode).toBe('HTML')
		expect(message.input_message_content.message_text).toContain('&amp;')
		expect(message.input_message_content.message_text).toContain(
			'&lt;tag&gt;'
		)
		expect(profile.input_message_content.message_text).not.toContain(
			'Статус:'
		)
	})
})
