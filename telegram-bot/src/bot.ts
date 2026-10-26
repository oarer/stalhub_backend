import {
	AllowedUpdatesFilter,
	Bot,
	bold,
	code,
	format,
	InlineKeyboard,
	MediaUpload,
} from 'gramio'
import type { BotConfig } from './config'
import type { KeyedDebouncer } from './debounce'
import type { ItemDetailCache } from './detail'
import { helpText, messageArticle, profileStatsKeyboard } from './format'
import { buildInlineResults, type InlineLookup } from './inline'
import type { ItemLookup } from './items'
import { parseInlineQuery, type Region } from './query'
import type { RateLimiter } from './rate-limit'
import { RenderError, type RenderSvg } from './render'
import { profileSessionKey, type SessionStore } from './session'
import {
	CLAN_KIND,
	categoryMeta,
	categoryStatsText,
	clanHistoryCaption,
	clanHistoryText,
	renderCategoryStatsSvg,
	renderMainStatsSvg,
} from './stat-view'
import type { PlayerProfile } from './stats'

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
	session: SessionStore<PlayerProfile>
	render: RenderSvg
}

const STATS_CALLBACK = /^st:([0-9a-f]+):([a-z]+)$/
const STATS_TTL_HINT =
	'Поиск устарел. Выполните его заново: @StalhubBot ник [регион].'

export function createBot({
	config,
	lookup,
	items,
	details,
	limiter,
	searchDebouncer,
	session,
	render,
}: BotDependencies): Bot {
	function statsKeyboard(hash: string): InlineKeyboard {
		const keyboard = new InlineKeyboard()
		const rows = profileStatsKeyboard(hash)
		rows.forEach((row, rowIndex) => {
			for (const button of row) {
				if (button.url) keyboard.url(button.text, button.url)
				else keyboard.text(button.text, button.callback_data as string)
			}
			if (rowIndex < rows.length - 1) keyboard.row()
		})
		return keyboard
	}

	async function editToText(
		ctx: {
			inlineMessageId?: string
			bot: Bot
		},
		hash: string,
		kind: string,
		profile: PlayerProfile
	): Promise<void> {
		if (!ctx.inlineMessageId) return
		const card =
			kind === CLAN_KIND
				? clanHistoryText(profile)
				: categoryStatsText(
						profile,
						categoryMeta(kind) ?? categoryMeta('combat')!
					)
		await ctx.bot.api.editMessageText({
			inline_message_id: ctx.inlineMessageId,
			text: card.text,
			entities: card.entities,
			reply_markup: statsKeyboard(hash),
		})
	}

	return new Bot(config.token)
		.onError(({ context, kind, error }) => {
			console.error(
				`Telegram update ${context?.updateId ?? 'unknown'} failed (${kind}):`,
				error instanceof Error ? error.message : error
			)
		})
		.command('start', (ctx) => ctx.send(helpText()))
		.command('help', (ctx) => ctx.send(helpText()))
		.command('player', (ctx) =>
			processUpdate(ctx.updateId ?? 0, async () => {
				const parsed = parseInlineQuery(ctx.args ?? '')
				if (parsed.kind !== 'player') {
					const message =
						parsed.kind === 'error'
							? parsed.message
							: 'Формат: /player ник [регион] — например /player Nick EU.'
					await ctx.send(message)
					return
				}
				const region = parsed.regions[0] as Region
				let profile: PlayerProfile
				try {
					profile = await lookup(region, parsed.character)
				} catch {
					await ctx.send(
						`Персонаж «${parsed.character}» не найден в регионе ${region}.`
					)
					return
				}
				const hash = profileSessionKey(region, profile.username)
				session.set(hash, profile)
				try {
					const image = await render(renderMainStatsSvg(profile))
					await ctx.sendPhoto(MediaUpload.buffer(image), {
						reply_markup: statsKeyboard(hash),
					})
				} catch {
					await ctx.send(
						'Сервис карточек статистики недоступен — попробуйте позже.'
					)
				}
			})
		)
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
		.callbackQuery(STATS_CALLBACK, (ctx) =>
			processUpdate(ctx.updateId ?? 0, async () => {
				const [, hash, kind] = ctx.queryData
				const profile = session.get(hash)
				if (!profile) {
					await ctx.answer({
						text: STATS_TTL_HINT,
						show_alert: false,
					})
					return
				}
				try {
					if (ctx.inlineMessageId) {
						await ctx.answer()
						await editToText(ctx, hash, kind, profile)
						return
					}
					const message = ctx.message
					if (!message) {
						await ctx.answer(STATS_TTL_HINT)
						return
					}
					await ctx.answer()
					if (kind === CLAN_KIND) {
						if (message.photo) {
							await message.editCaption(
								clanHistoryCaption(profile),
								{
									reply_markup: statsKeyboard(hash),
								}
							)
							return
						}
						const card = clanHistoryText(profile)
						await ctx.bot.api.editMessageText({
							chat_id: message.chatId,
							message_id: message.id,
							text: card.text,
							entities: card.entities,
							reply_markup: statsKeyboard(hash),
						})
						return
					}
					const category = categoryMeta(kind)
					if (!category) {
						await ctx.answer({
							text: 'Неизвестная категория статистики.',
						})
						return
					}
					if (message.photo) {
						const image = await render(
							renderCategoryStatsSvg(profile, category)
						)
						await message.editMessageMedia(
							{
								type: 'photo',
								media: MediaUpload.buffer(image),
							},
							{ reply_markup: statsKeyboard(hash) }
						)
						return
					}
					const card = categoryStatsText(profile, category)
					await ctx.bot.api.editMessageText({
						chat_id: message.chatId,
						message_id: message.id,
						text: card.text,
						entities: card.entities,
						reply_markup: statsKeyboard(hash),
					})
				} catch (error) {
					console.error(
						'Stats view failed:',
						error instanceof Error ? error.message : error
					)
					await ctx
						.answer({
							text:
								error instanceof RenderError
									? 'Сервис карточек статистики недоступен.'
									: 'Не удалось подготовить данные статистики.',
						})
						.catch(() => undefined)
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
							items,
							session
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
