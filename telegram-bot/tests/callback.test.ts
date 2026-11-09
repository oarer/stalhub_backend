import { describe, expect, mock, test } from 'bun:test'
import type { AnswerCallbackQueryParams, EditMessageTextParams } from '@gramio/types'
import { createBot } from '../src/bot'
import { loadConfig } from '../src/config'
import { KeyedDebouncer } from '../src/debounce'
import { ItemDetailCache } from '../src/detail'
import { RateLimiter } from '../src/rate-limit'
import { profileSessionKey, SessionStore } from '../src/session'
import type { PlayerProfile } from '../src/stats'

const authorId = 1234567890123
const hash = profileSessionKey('RU', 'Nick')
const callbacks = [
	{ data: `home:${authorId}` },
	{ data: `st:${authorId}:${hash}:combat` },
	{ data: `i:${authorId}:weapon:qyvk`, level: 0 },
	{ data: `itemu:${authorId}:weapon:qyvk:10`, level: 10 },
]

function setup() {
	const config = loadConfig({ TG_BOT_TOKEN: '123:test' })
	const session = new SessionStore<PlayerProfile>(60_000)
	session.set(hash, { username: 'Nick', stats: [] })
	const details = new ItemDetailCache(config)
	const detail = mock(async (_category: string, _id: string, level = 0) => ({
		title: 'Item',
		text: 'Item details',
		entities: [],
		pageUrl: 'https://stalhub.dev/items/weapon/qyvk',
		upgradeLevels: 15,
		upgradeLevel: level,
	}))
	details.detail = detail
	const bot = createBot({
		config,
		lookup: async () => ({ username: 'Nick', stats: [] }),
		items: { search: async () => [] },
		details,
		limiter: new RateLimiter(10),
		searchDebouncer: new KeyedDebouncer<number>(0),
		session,
	})
	const answer = mock(async (_params: AnswerCallbackQueryParams) => true as const)
	const edit = mock(async (_params?: EditMessageTextParams) => true as const)
	bot.api.answerCallbackQuery = answer
	bot.api.editMessageText = edit

	async function click(data: string, userId: number) {
		await bot.updates.handleUpdate({
			update_id: 1,
			callback_query: {
				id: 'callback-id',
				from: { id: userId, is_bot: false, first_name: 'User' },
				chat_instance: 'chat-instance',
				inline_message_id: 'inline-message-id',
				data,
			},
		})
	}

	return { click, answer, edit, detail }
}

describe('callback author authorization through GramIO', () => {
	for (const callback of callbacks) {
		test(`allows the search author: ${callback.data}`, async () => {
			const { click, answer, edit, detail } = setup()
			await click(callback.data, authorId)
			expect(edit).toHaveBeenCalledTimes(1)
			expect(edit.mock.calls[0]).toEqual([
				expect.objectContaining({ inline_message_id: 'inline-message-id' }),
			])
			expect(answer.mock.calls).not.toContainEqual([
				expect.objectContaining({ show_alert: true }),
			])
			if (callback.level !== undefined) {
				expect(detail).toHaveBeenCalledWith('weapon', 'qyvk', callback.level)
			}
		})

		test(`rejects another user: ${callback.data}`, async () => {
			const { click, answer, edit, detail } = setup()
			await click(callback.data, authorId + 1)
			expect(answer).toHaveBeenCalledWith({
				callback_query_id: 'callback-id',
				text: 'Только автор поиска может нажимать эти кнопки.',
				show_alert: true,
			})
			expect(edit).not.toHaveBeenCalled()
			expect(detail).not.toHaveBeenCalled()
		})
	}
})
