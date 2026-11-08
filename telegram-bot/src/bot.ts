import type { EditMessageTextParams } from '@gramio/types'
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
import {
	helpText,
	messageArticle,
	profileCardText,
	profileStatsKeyboard,
} from './format'
import { buildInlineResults, emptyHint, type InlineLookup } from './inline'
import type { ItemLookup } from './items'
import { parseInlineQuery, type Region } from './query'
import type { RateLimiter } from './rate-limit'
import { profileSessionKey, type SessionStore } from './session'
import {
	CLAN_KIND,
	categoryMeta,
	categoryStatsText,
	clanHistoryText,
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
}

const STATS_CALLBACK = /^st:(\d+):([0-9a-f]+):([a-z]+)$/
const ITEM_CALLBACK = /^i:(\d+):(.+):(.+)$/
const ITEM_UPGRADE_CALLBACK = /^itemu:(\d+):(.+):([^:]+):(\d+)$/
const HOME_CALLBACK = /^home:(\d+)$/
const STATS_TTL_HINT =
	'Поиск устарел. Выполните его заново: @StalhubBot ник [регион].'
const AUTH_HINT = 'Только автор поиска может нажимать эти кнопки.'

type CallbackGuardContext = {
	from?: { id?: number }
}

function authorized(ctx: CallbackGuardContext, userId: string): boolean {
	return Boolean(ctx.from?.id) && String(ctx.from?.id) === userId
}

export function createBot({
	config,
	lookup,
	items,
	details,
	limiter,
	searchDebouncer,
	session,
}: BotDependencies): Bot {
	function statsKeyboard(hash: string, userId: number): InlineKeyboard {
		const keyboard = new InlineKeyboard()
		const rows = [
			...profileStatsKeyboard(hash, userId),
			[{ text: 'Главная', callback_data: `home:${userId}` }],
		]
		rows.forEach((row, rowIndex) => {
			for (const button of row) {
				if (button.url) keyboard.url(button.text, button.url)
				else keyboard.text(button.text, button.callback_data as string)
			}
			if (rowIndex < rows.length - 1) keyboard.row()
		})
		return keyboard
	}

	type ItemCallbackContext = {
		from?: { id?: number }
		answer(params?: {
			text?: string
			show_alert?: boolean
		}): Promise<unknown>
		inlineMessageId?: string
		message?: { chatId: number; id: number }
		bot: {
			api: {
				editMessageText(
					params?: EditMessageTextParams
				): Promise<unknown>
			}
		}
	}

	async function updateItemMessage(
		category: string,
		id: string,
		level: number,
		userId: number,
		ctx: ItemCallbackContext
	): Promise<void> {
		try {
			const payload = await details.detail(category, id, level)
			const levels = [0, 5, 10, 15]
				.filter((level) => level <= payload.upgradeLevels)
				.map((level) => ({
					text: `${level === payload.upgradeLevel ? '✓ ' : ''}Заточка +${level}`,
					callback_data: `itemu:${userId}:${category}:${id}:${level}`,
				}))
			const message = ctx.message
			if (!ctx.inlineMessageId && !message) {
				await ctx.answer({ text: STATS_TTL_HINT, show_alert: false })
				return
			}
			const common = {
				text: payload.text,
				entities: payload.entities,
				reply_markup: {
					inline_keyboard: [
						...(levels.length > 1 ? [levels] : []),
						[{ text: 'Открыть на StalHub', url: payload.pageUrl }],
						[{ text: 'Главная', callback_data: `home:${userId}` }],
					],
				},
			}
			if (ctx.inlineMessageId) {
				await ctx.bot.api.editMessageText({
					inline_message_id: ctx.inlineMessageId,
					...common,
				})
				return
			}
			if (!message) {
				await ctx.answer({ text: STATS_TTL_HINT, show_alert: false })
				return
			}
			await ctx.bot.api.editMessageText({
				chat_id: message.chatId,
				message_id: message.id,
				...common,
			})
		} catch {
			await ctx.answer({ text: 'Не удалось загрузить данные предмета.' })
		}
	}

	function statsCard(
		profile: PlayerProfile,
		kind: string
	): ReturnType<typeof categoryStatsText> {
		return kind === CLAN_KIND
			? clanHistoryText(profile)
			: categoryStatsText(
					profile,
					categoryMeta(kind) ?? categoryMeta('combat')!
				)
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
				const card = profileCardText(profile, region)
				await ctx.send(card.text, {
					entities: card.entities,
					reply_markup: statsKeyboard(hash, ctx.from.id),
				})
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
		.callbackQuery(HOME_CALLBACK, (ctx) =>
			processUpdate(ctx.updateId ?? 0, async () => {
				// RegExp matches contain the full callback data at index 0.
				const [, userId] = ctx.queryData
				if (!authorized(ctx, userId as string)) {
					await ctx.answer({ text: AUTH_HINT, show_alert: true })
					return
				}
				const uid = Number(userId)
				await ctx.answer()
				if (!ctx.inlineMessageId) return
				const hint = emptyHint()
				await ctx.bot.api.editMessageText({
					inline_message_id: ctx.inlineMessageId,
					text: hint.input_message_content.message_text,
					reply_markup: {
						inline_keyboard: [
							[{ text: 'Главная', callback_data: `home:${uid}` }],
						],
					},
				})
			})
		)
		.callbackQuery(ITEM_UPGRADE_CALLBACK, (ctx) =>
			processUpdate(ctx.updateId ?? 0, async () => {
				const [, userId, category, id, level] = ctx.queryData
				if (!authorized(ctx, userId as string)) {
					await ctx.answer({ text: AUTH_HINT, show_alert: true })
					return
				}
				await updateItemMessage(
					category as string,
					id as string,
					Number(level),
					Number(userId),
					ctx
				)
			})
		)
		.callbackQuery(ITEM_CALLBACK, (ctx) =>
			processUpdate(ctx.updateId ?? 0, async () => {
				const [, userId, category, id] = ctx.queryData
				if (!authorized(ctx, userId as string)) {
					await ctx.answer({ text: AUTH_HINT, show_alert: true })
					return
				}
				await updateItemMessage(
					category as string,
					id as string,
					0,
					Number(userId),
					ctx
				)
			})
		)
		.callbackQuery(STATS_CALLBACK, (ctx) =>
			processUpdate(ctx.updateId ?? 0, async () => {
				const [, userId, hash, kind] = ctx.queryData
				if (!authorized(ctx, userId as string)) {
					await ctx.answer({ text: AUTH_HINT, show_alert: true })
					return
				}
				if (
					hash &&
					kind !== 'history' &&
					!categoryMeta(kind as string)
				) {
					await ctx.answer({
						text: 'Неизвестная категория статистики.',
					})
					return
				}
				const profile = session.get(hash as string)
				if (!profile) {
					await ctx.answer({
						text: STATS_TTL_HINT,
						show_alert: false,
					})
					return
				}
				const uid = Number(userId)
				try {
					const card = statsCard(profile, kind as string)
					await ctx.answer()
					if (ctx.inlineMessageId) {
						await ctx.bot.api.editMessageText({
							inline_message_id: ctx.inlineMessageId,
							text: card.text,
							entities: card.entities,
							reply_markup: statsKeyboard(hash as string, uid),
						})
						return
					}
					const message = ctx.message
					if (!message) {
						await ctx.answer(STATS_TTL_HINT)
						return
					}
					await ctx.bot.api.editMessageText({
						chat_id: message.chatId,
						message_id: message.id,
						text: card.text,
						entities: card.entities,
						reply_markup: statsKeyboard(hash as string, uid),
					})
				} catch (error) {
					console.error(
						'Stats view failed:',
						error instanceof Error ? error.message : error
					)
					await ctx
						.answer({
							text: 'Не удалось подготовить данные статистики.',
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
							session,
							ctx.from.id
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
