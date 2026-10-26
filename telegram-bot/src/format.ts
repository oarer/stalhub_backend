import {
	bold,
	code,
	customEmoji,
	expandableBlockquote,
	FormattableString,
	format,
} from 'gramio'
import type { ListedItem } from './items'
import { rankName } from './items'
import { profileUrl, type Region } from './query'
import { profileSessionKey } from './session'
import type { StatCategoryKey } from './stat-view'
import {
	extractMetrics,
	formatDate,
	formatHours,
	formatMetric,
	type PlayerProfile,
} from './stats'

export type InlineKeyboardButton = {
	text: string
	url?: string
	callback_data?: string
}

export type InlineArticle = {
	type: 'article'
	id: string
	title: string
	description?: string
	thumb_url?: string
	input_message_content: {
		message_text: string
		entities?: FormattableString['entities']
	}
	reply_markup?: {
		inline_keyboard: InlineKeyboardButton[][]
	}
}

const MAX_INLINE_ID_BYTES = 64
const MAX_MESSAGE_TEXT_LENGTH = 4096
const MAX_DISPLAY_LENGTH = 160

export const FACTION_NAMES = new Map([
	['merc', 'Наёмник'],
	['covenant', 'Завет'],
	['freedom', 'Заря'],
	['duty', 'Долг'],
	['bandits', 'Бандит'],
	['stalkers', 'Сталкер'],
])

export const CLAN_RANK_NAMES = new Map([
	['leader', 'Лидер'],
	['colonel', 'Полковник'],
	['officer', 'Офицер'],
	['sergeant', 'Сержант'],
	['soldier', 'Боец'],
	['commoner', 'Запасной'],
	['recruit', 'Рядовой'],
])

function mappedName(
	value: string | null | undefined,
	names: ReadonlyMap<string, string>
): string | null | undefined {
	return value ? (names.get(value.trim().toLowerCase()) ?? value) : value
}

function shortHash(value: string): string {
	let hash = 2_166_136_261
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0
		hash = Math.imul(hash, 16_777_619) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

function resultId(value: string): string {
	if (new TextEncoder().encode(value).byteLength <= MAX_INLINE_ID_BYTES) {
		return value
	}
	return `result:${shortHash(value)}`
}

function truncate(value: string, maxLength: number): string {
	const characters = [...value]
	return characters.length > maxLength
		? `${characters.slice(0, maxLength - 1).join('')}…`
		: value
}

function display(value: unknown, maxLength = MAX_DISPLAY_LENGTH): string {
	const text =
		value === null || value === undefined || value === ''
			? '—'
			: String(value).replace(/\s+/g, ' ').trim()
	return truncate(text, maxLength)
}

export function limitFormattable(source: FormattableString): FormattableString {
	if (source.text.length <= MAX_MESSAGE_TEXT_LENGTH) return source

	const text = `${source.text.slice(0, MAX_MESSAGE_TEXT_LENGTH - 1)}…`
	const entities = source.entities
		.filter((entity) => entity.offset < text.length)
		.map((entity) => ({
			...entity,
			length: Math.min(entity.length, text.length - entity.offset),
		}))
		.filter((entity) => entity.length > 0)
	return FormattableString.from(text, entities)
}

function cardText(
	profile: PlayerProfile,
	region: Region,
	maxFieldLength = MAX_DISPLAY_LENGTH
): FormattableString {
	const metrics = extractMetrics(profile)
	const clan = profile.clan?.info?.name
	const clanTag = profile.clan?.info?.tag
	const clanText = clan ? `${clan}${clanTag ? ` [${clanTag}]` : ''}` : '—'
	const clanHistory = profile.clan_history ?? []
	const historyText = clanHistory.length
		? format`

История кланов:
${expandableBlockquote(
	clanHistory
		.map((entry) => {
			const name = `${entry.clan_name}${entry.clan_tag ? ` [${entry.clan_tag}]` : ''}`
			return `${display(name, maxFieldLength)} · ${display(mappedName(entry.rank, CLAN_RANK_NAMES))} · ${display(entry.region)} · ${display(formatDate(entry.joined_at ?? entry.seen_at))}`
		})
		.join('\n')
)}`
		: undefined

	return format`${bold(display(profile.username, maxFieldLength))} (${display(region)})
Регион: ${bold(display(region))}

Фракция: ${display(mappedName(profile.alliance, FACTION_NAMES), maxFieldLength)}
Клан: ${display(clanText, maxFieldLength)}${historyText}

K/D: ${bold(formatMetric(metrics.kd))}
K/D Противостояния: ${bold(formatMetric(metrics.battleKd))}
Часы: ${bold(formatHours(metrics.hours))}
Начал играть: ${bold(display(formatDate(metrics.registeredAt), maxFieldLength))}
Точность: ${bold(`${formatMetric(metrics.accuracy)}%`)}`
}

export function profileCardText(
	profile: PlayerProfile,
	region: Region
): FormattableString {
	return limitFormattable(cardText(profile, region))
}

export function profileStatsKeyboard(hash: string): InlineKeyboardButton[][] {
	const labels: Record<StatCategoryKey, string> = {
		combat: '⚔ Боёвка',
		survival: '🧭 Выживание',
		exploration: '🗺 Исследование',
		session: '🎯 Сессии',
		economy: '💰 Экономика',
		hideout: '🏠 Убежище',
	}
	const button = (key: StatCategoryKey): InlineKeyboardButton => ({
		text: labels[key],
		callback_data: `st:${hash}:${key}`,
	})
	return [
		[button('combat'), button('survival'), button('exploration')],
		[button('session'), button('economy'), button('hideout')],
		[{ text: '📜 История кланов', callback_data: `st:${hash}:history` }],
	]
}

export function profileArticle(
	profile: PlayerProfile,
	region: Region,
	id = `${region}:${profile.username}`
): InlineArticle {
	const card = profileCardText(profile, region)
	const username = display(profile.username)
	return {
		type: 'article',
		id: resultId(id),
		title: `${username} (${region})`,
		description: `Профиль ${username} — K/D ${formatMetric(extractMetrics(profile).kd)}`,
		input_message_content: {
			message_text: card.text,
			entities: card.entities,
		},
		reply_markup: {
			inline_keyboard: [
				[
					{
						text: 'Открыть на StalHub',
						url: profileUrl(region, profile.username),
					},
				],
				...profileStatsKeyboard(
					profileSessionKey(region, profile.username)
				),
			],
		},
	}
}

export function itemArticle(
	entry: ListedItem,
	id = `item:${entry.id}`
): InlineArticle {
	const primary = display(entry.name.ru ?? entry.name.en)
	const rank = rankName(entry.color)
	const card = limitFormattable(format`${bold(primary)}

	Ранг: ${bold(display(rank ?? '—'))}`)
	const callback = `item:${entry.category}:${entry.id}`
	const hasCallback = new TextEncoder().encode(callback).byteLength <= 64
	const keyboard: InlineKeyboardButton[] = hasCallback
		? [
				{
					text: 'Характеристики',
					callback_data: callback,
				},
			]
		: []
	return {
		type: 'article',
		id: resultId(`${id}:${entry.category}`),
		title: primary,
		description: `Предмет StalHub · Ранг: ${display(rank ?? '—')}`,
		thumb_url: entry.iconUrl ?? undefined,
		input_message_content: {
			message_text: card.text,
			entities: card.entities,
		},
		reply_markup: {
			inline_keyboard: [
				...keyboard.map((button) => [button]),
				[
					{
						text: 'Открыть на StalHub',
						url: entry.pageUrl,
					},
				],
			],
		},
	}
}

export function messageArticle(
	message: string,
	id: string,
	options: { title?: string; description?: string } = {}
): InlineArticle {
	return {
		type: 'article',
		id: resultId(id),
		title: options.title ?? 'StalHub',
		description: options.description ?? message,
		input_message_content: {
			message_text: display(message, MAX_MESSAGE_TEXT_LENGTH),
		},
	}
}

export function helpText(): FormattableString {
	return format`${bold`${customEmoji('🦠', '5345778951031658558')} StalHub | Bot`}

В любом чате введите ${code`@StalhubBot ник [регион]`}.
Без региона поиск выполняется в RU.
	Другой регион можно указать явно: ${code`@StalhubBot ник EU`}.

Карточку статистики можно получить командой ${code`/player ник [регион]`}.

Поиск предметов: ${code`@StalhubBot /i название`} (например, ${code`@StalhubBot /i вспышка`}
или ${code`@StalhubBot /i flare`}).

${customEmoji('🔗', '6028171274939797252')} Сайт можно открыть прямо в Telegram: /app или кнопка меню.`
}
