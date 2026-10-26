import { AllowedUpdatesFilter } from 'gramio'
import { ProfileCache } from './backend'
import { createBot, type UpdateProcessResult } from './bot'
import { loadConfig } from './config'
import { KeyedDebouncer } from './debounce'
import { ItemDetailCache } from './detail'
import { createLookup } from './inline'
import { ItemDatabase } from './items'
import { RateLimiter } from './rate-limit'

export type { UpdateProcessResult }

async function main(): Promise<void> {
	const config = loadConfig()
	const cache = new ProfileCache(config.cacheTtlSeconds * 1000)
	const lookup = createLookup(config, cache)
	const items = new ItemDatabase(config)
	const details = new ItemDetailCache(config)
	const limiter = new RateLimiter(config.rateLimitPerMinute)
	const searchDebouncer = new KeyedDebouncer<number>(config.searchDebounceMs)
	const bot = createBot({
		config,
		lookup,
		items,
		details,
		limiter,
		searchDebouncer,
	})

	await bot.api.setMyCommands({
		commands: [
			{ command: 'start', description: 'Инструкция по inline-поиску' },
			{ command: 'help', description: 'Показать помощь' },
			{ command: 'player', description: 'Показать формат поиска' },
			{ command: 'items', description: 'Поиск предметов' },
			{ command: 'app', description: 'Открыть StalHub в Telegram' },
		],
	})

	await bot.api.setChatMenuButton({
		menu_button: {
			type: 'web_app',
			text: 'Открыть StalHub',
			web_app: { url: config.webAppUrl },
		},
	})

	console.log(`Telegram bot started; backend: ${config.backendUrl}`)
	await bot.start({
		longPolling: { timeout: config.pollingTimeoutSeconds },
		allowedUpdates: AllowedUpdatesFilter.only(
			'message',
			'inline_query',
			'callback_query'
		),
	})
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
