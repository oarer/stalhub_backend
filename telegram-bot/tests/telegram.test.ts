import { describe, expect, test } from 'bun:test'
import { TelegramApi } from '../src/telegram'

describe('Telegram API', () => {
	test('sends messages in HTML mode', async () => {
		const bodies: Record<string, unknown>[] = []
		const fetchImpl = (async (
			_input: RequestInfo | URL,
			init?: RequestInit
		) => {
			bodies.push(
				JSON.parse(String(init?.body)) as Record<string, unknown>
			)
			return new Response(
				JSON.stringify({
					ok: true,
					result: { message_id: 1, chat: { id: 42 } },
				})
			)
		}) as typeof fetch

		await new TelegramApi('test-token', fetchImpl).sendMessage(
			42,
			'<b>Hello</b>'
		)

		expect(bodies).toEqual([
			{
				chat_id: 42,
				text: '<b>Hello</b>',
				parse_mode: 'HTML',
			},
		])
	})
})
