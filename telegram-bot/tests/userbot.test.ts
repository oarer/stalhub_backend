import { describe, expect, test } from 'bun:test'
import { loadUserbotConfig, parseUserbotSources } from '../src/userbot-config'
import {
	mapSourceForChannels,
	telegramEntitiesToMarkdown,
} from '../src/userbot-content'

describe('userbot source mapping', () => {
	test('maps channel IDs with Telegram -100 prefixes', () => {
		const sources = parseUserbotSources({
			USERBOT_EXBO_CHANNEL: '@exbo_channel',
			USERBOT_STALZONE_CHANNEL: '-10012345,stalzone_report',
			USERBOT_OFFICIAL_MEDIA_CHANNEL: 'official_media',
		})

		expect(mapSourceForChannels(['-10012345'], sources)?.source).toBe(
			'STALZONE_REPORT'
		)
		expect(mapSourceForChannels(['@exbo_channel'], sources)?.source).toBe(
			'EXBO_TG'
		)
	})

	test('supports the compact source mapping syntax', () => {
		expect(
			parseUserbotSources({
				USERBOT_SOURCES:
					'EXBO_TG=@exbo;STALZONE_REPORT=@report1,@report2',
			})
		).toEqual([
			{ source: 'EXBO_TG', channels: ['exbo'] },
			{ source: 'STALZONE_REPORT', channels: ['report1', 'report2'] },
		])
	})
})

describe('Telegram entity markdown', () => {
	test('converts bold, italic, and text URLs', () => {
		const text = 'Bold italic link'
		expect(
			telegramEntitiesToMarkdown(text, [
				{ offset: 0, length: 4, className: 'MessageEntityBold' },
				{ offset: 5, length: 6, className: 'MessageEntityItalic' },
				{
					offset: 12,
					length: 4,
					className: 'MessageEntityTextUrl',
					url: 'https://example.com',
				},
			])
		).toBe('**Bold** __italic__ [link](https://example.com)')
	})
})

describe('userbot config', () => {
	test('uses the existing internal bot secret env var', () => {
		const config = loadUserbotConfig({
			TG_API_ID: '123',
			TG_API_HASH: 'hash',
			DISCORD_BOT_SERVICE_JWT: 'secret',
			USERBOT_EXBO_CHANNEL: 'exbo',
		})
		expect(config.botSecret).toBe('secret')
		expect(config.backendUrl).toBe('http://localhost:3001/api/v1')
	})
})
