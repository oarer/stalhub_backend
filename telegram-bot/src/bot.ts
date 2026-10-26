import {
	AllowedUpdatesFilter,
	Bot,
	bold,
	code,
	format,
	InlineKeyboard,
} from 'gramio'
import type { BotConfig } from './config'
import type { KeyedDebouncer } from './debounce'
import type { ItemDetailCache } from './detail'
import { helpText, messageArticle } from './format'
import { buildInlineResults, type InlineLookup } from './inline'
import type { ItemLookup } from './items'
import type { RateLimiter } from './rate-limit'

export type UpdateProcessResult = 'handled' | 'skipped'

export async function processUpdate(
	updateId: number,
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
					`Telegram update ${updateId} skipped after ${attempt} attempts:`,
					error instanceof Error ? error.message : error
				)
				return 'skipped'
			}
			await sleep(250)
		}
	}
	return 'skipped'
}

export type BotDependencies = {
	config: BotConfig
	lookup: InlineLookup
	items: ItemLookup
	details: ItemDetailCache
	limiter: RateLimiter
	searchDebouncer: KeyedDebouncer<number>
}

export function createBot({
	config,
	lookup,
	items,
	details,
	limiter,
	searchDebouncer,
}: BotDependencies): Bot {
	return new Bot(config.token)
		.onError(({ context, kind, error }) => {
			console.error(
				`Telegram update ${context?.updateId ?? 'unknown'} failed (${kind}):`,
				error instanceof Error ? error.message : error
			)
		})
		.command('start', (ctx) => ctx.send(helpText()))
		.command('help', (ctx) => ctx.send(helpText()))
		.command('player', (ctx) => {
			const hint = ctx.args
				? format`Откройте inline-режим: ${code`@StalhubBot ${ctx.args}`}`
				: format`Подсказка: в любом чате введите ${code`@StalhubBot ник`} (по умолчанию регион RU, например ${code`@StalhubBot Nick EU`}).`
			return ctx.send(hint)
		})
		.command('app', (ctx) =>
			ctx.send(format`Открыть ${bold`StalHub`} прямо в Telegram:`, {
				reply_markup: new InlineKeyboard().webApp(
					'🌐 StalHub',
					config.webAppUrl
				),
			})
		)
		.command('items', (ctx) =>
			ctx.send(
				format`Поиск предметов: ${code`@StalhubBot /i название`} (например, ${code`@StalhubBot /i вспышка`}). Нажмите «Характеристики» под результатом, чтобы раскрыть статы.`
			)
		)
		.callbackQuery(/^item:(.+):(.+)$/, (ctx) =>
			processUpdate(ctx.updateId ?? 0, async () => {
				const [, category, id] = ctx.queryData
				try {
					const payload = await details.detail(category, id)
					await ctx.answer()
					if (!ctx.inlineMessageId) return
					await ctx.bot.api.editMessageText({
						inline_message_id: ctx.inlineMessageId,
						text: payload.text,
						entities: payload.entities,
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: 'Открыть на StalHub',
										url: payload.pageUrl,
									},
								],
							],
						},
					})
				} catch {
					await ctx.answer({
						text: 'Не удалось загрузить данные предмета.',
					})
				}
			})
		)
		.inlineQuery((ctx) =>
			processUpdate(ctx.updateId ?? 0, async () => {
				if (!limiter.allow(ctx.from.id)) {
					await ctx.answer(
						[
							messageArticle(
								'Слишком много запросов. Попробуйте через минуту.',
								'rate-limit'
							),
						],
						{ cache_time: 0, is_personal: true }
					)
					return
				}

				await searchDebouncer.schedule(
					ctx.from.id,
					async (isLatest) => {
						const results = await buildInlineResults(
							ctx.query,
							lookup,
							items
						)
						if (!isLatest()) return
						await ctx.answer(results, {
							cache_time: config.cacheTtlSeconds,
							is_personal: true,
						})
					},
					() => ctx.answer([], { cache_time: 0 })
				)
			})
		)
}

export { AllowedUpdatesFilter }
