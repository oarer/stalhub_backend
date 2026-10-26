import { ProfileCache } from './backend'
import { loadConfig } from './config'
import { KeyedDebouncer } from './debounce'
import { escapeHtml, helpText, messageArticle } from './format'
import { buildInlineResults, createLookup } from './inline'
import { RateLimiter } from './rate-limit'
import {
	TelegramApi,
	type TelegramMessage,
	type TelegramUpdate,
} from './telegram'

function commandOf(text: string): { command: string; args: string } | null {
	const match = text.trim().match(/^\/(\w+)(?:@[^\s]+)?(?:\s+(.*))?$/s)
	return match
		? { command: match[1].toLowerCase(), args: match[2]?.trim() ?? '' }
		: null
}

export type UpdateProcessResult = 'handled' | 'skipped'

export async function processUpdate(
	update: TelegramUpdate,
	handle: () => Promise<void>,
	maxAttempts = 3,
	sleep: (milliseconds: number) => Promise<void> = Bun.sleep
): Promise<UpdateProcessResult> {
	const attempts = Math.max(1, Math.floor(maxAttempts))
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			await handle()
			return 'handled'
		} catch (error) {
			if (attempt === attempts) {
				console.error(
					`Telegram update ${update.update_id} skipped after ${attempt} attempts:`,
					error instanceof Error ? error.message : error
				)
				return 'skipped'
			}
			await sleep(250)
		}
	}
	return 'skipped'
}

async function handleMessage(
	message: TelegramMessage,
	telegram: TelegramApi
): Promise<void> {
	if (!message.text) return
	const command = commandOf(message.text)
	if (!command) return

	if (command.command === 'start' || command.command === 'help') {
		await telegram.sendMessage(message.chat.id, helpText())
		return
	}
	if (command.command === 'player') {
		const hint = command.args
			? `Откройте inline-режим: @stalhubbot ${command.args}`
			: 'Подсказка: в любом чате введите @stalhubbot ник или @stalhubbot ник RU.'
		await telegram.sendMessage(message.chat.id, escapeHtml(hint))
	}
}

async function handleUpdate(
	update: TelegramUpdate,
	telegram: TelegramApi,
	config: ReturnType<typeof loadConfig>,
	lookup: ReturnType<typeof createLookup>,
	limiter: RateLimiter,
	searchDebouncer = new KeyedDebouncer<number>(config.searchDebounceMs)
): Promise<void> {
	if (update.message) {
		await handleMessage(update.message, telegram)
		return
	}
	const inline = update.inline_query
	if (!inline) return
	if (!limiter.allow(inline.from.id)) {
		await telegram.answerInlineQuery(
			inline.id,
			[
				messageArticle(
					'Слишком много запросов. Попробуйте через минуту.',
					'rate-limit'
				),
			],
			0
		)
		return
	}

	await searchDebouncer.schedule(
		inline.from.id,
		async (isLatest) => {
			const results = await buildInlineResults(inline.query, lookup)
			if (!isLatest()) return
			await telegram.answerInlineQuery(
				inline.id,
				results,
				config.cacheTtlSeconds
			)
		},
		() => telegram.answerInlineQuery(inline.id, [], 0)
	)
}

async function main(): Promise<void> {
	const config = loadConfig()
	const telegram = new TelegramApi(config.token)
	await telegram.deleteWebhook()
	await telegram.setMyCommands()
	const cache = new ProfileCache(config.cacheTtlSeconds * 1000)
	const lookup = createLookup(config, cache)
	const limiter = new RateLimiter(config.rateLimitPerMinute)
	const searchDebouncer = new KeyedDebouncer<number>(config.searchDebounceMs)
	let offset: number | undefined

	console.log(`Telegram bot started; backend: ${config.backendUrl}`)
	while (true) {
		try {
			const updates = await telegram.getUpdates(
				offset,
				config.pollingTimeoutSeconds
			)
			if (updates.length > 0) {
				offset = updates[updates.length - 1].update_id + 1
			}
			for (const update of updates) {
				void processUpdate(update, () =>
					handleUpdate(
						update,
						telegram,
						config,
						lookup,
						limiter,
						searchDebouncer
					)
				).catch((error) => {
					console.error(
						`Telegram update ${update.update_id} processing failed:`,
						error instanceof Error ? error.message : error
					)
				})
			}
		} catch (error) {
			console.error(
				'Telegram polling failed:',
				error instanceof Error ? error.message : error
			)
			await Bun.sleep(2_000)
		}
	}
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(
			'Telegram bot startup failed:',
			error instanceof Error ? error.message : error
		)
		process.exit(1)
	})
}

export { commandOf, handleMessage, handleUpdate }
