import type { InlineArticle } from './format'

export type TelegramUser = { id: number }
export type TelegramMessage = {
	message_id: number
	chat: { id: number }
	from?: TelegramUser
	text?: string
}
export type TelegramInlineQuery = {
	id: string
	from: TelegramUser
	query: string
}
export type TelegramUpdate = {
	update_id: number
	message?: TelegramMessage
	inline_query?: TelegramInlineQuery
}

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string }

export class TelegramApi {
	private readonly baseUrl: string

	constructor(
		token: string,
		private readonly fetchImpl: typeof fetch = fetch
	) {
		this.baseUrl = `https://api.telegram.org/bot${token}`
	}

	private async call<T>(
		method: string,
		body: Record<string, unknown>
	): Promise<T> {
		const response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
		const payload = (await response.json()) as TelegramResponse<T>
		if (!response.ok || !payload.ok || payload.result === undefined) {
			throw new Error(
				`Telegram ${method} failed: ${payload.description ?? response.statusText}`
			)
		}
		return payload.result
	}

	deleteWebhook(): Promise<boolean> {
		return this.call<boolean>('deleteWebhook', {
			drop_pending_updates: false,
		})
	}

	setMyCommands(): Promise<boolean> {
		return this.call<boolean>('setMyCommands', {
			commands: [
				{
					command: 'start',
					description: 'Инструкция по inline-поиску',
				},
				{ command: 'help', description: 'Показать помощь' },
				{ command: 'player', description: 'Показать формат поиска' },
			],
		})
	}

	getUpdates(
		offset: number | undefined,
		timeout: number
	): Promise<TelegramUpdate[]> {
		return this.call<TelegramUpdate[]>('getUpdates', {
			...(offset === undefined ? {} : { offset }),
			timeout,
			allowed_updates: ['message', 'inline_query'],
		})
	}

	answerInlineQuery(
		inlineQueryId: string,
		results: InlineArticle[],
		cacheTime: number
	): Promise<boolean> {
		return this.call<boolean>('answerInlineQuery', {
			inline_query_id: inlineQueryId,
			results,
			cache_time: cacheTime,
			is_personal: true,
		})
	}

	sendMessage(chatId: number, text: string): Promise<TelegramMessage> {
		return this.call<TelegramMessage>('sendMessage', {
			chat_id: chatId,
			text,
			parse_mode: 'HTML',
		})
	}
}
