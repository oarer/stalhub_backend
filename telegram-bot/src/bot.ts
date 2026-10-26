import { AllowedUpdatesFilter, Bot, bold, format, InlineKeyboard } from 'gramio'
import type { BotConfig } from './config'
import type { KeyedDebouncer } from './debounce'
import { escapeHtml, helpText, messageArticle } from './format'
import { buildInlineResults, type InlineLookup } from './inline'
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
	limiter: RateLimiter
	searchDebouncer: KeyedDebouncer<number>
}

export function createBot({
	config,
	lookup,
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
		.command('start', (ctx) => ctx.send(helpText(), { parse_mode: 'HTML' }))
		.command('help', (ctx) => ctx.send(helpText(), { parse_mode: 'HTML' }))
		.command('player', (ctx) => {
			const hint = ctx.args
				? `Откройте inline-режим: @stalhubbot ${ctx.args}`
				: 'Подсказка: в любом чате введите @stalhubbot ник или @stalhubbot ник RU.'
			return ctx.send(escapeHtml(hint), { parse_mode: 'HTML' })
		})
		.command('app', (ctx) =>
			ctx.send(format`Открыть ${bold`StalHub`} прямо в Telegram:`, {
				reply_markup: new InlineKeyboard().webApp(
					'🌐 StalHub',
					config.webAppUrl
				),
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
							lookup
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
