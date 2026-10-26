import { profileUrl, type Region } from './query'
import {
	extractMetrics,
	formatDate,
	formatHours,
	formatMetric,
	type PlayerProfile,
} from './stats'

export type InlineArticle = {
	type: 'article'
	id: string
	title: string
	description?: string
	input_message_content: {
		message_text: string
		parse_mode: 'HTML'
	}
	reply_markup?: {
		inline_keyboard: Array<Array<{ text: string; url: string }>>
	}
}

const MAX_INLINE_ID_BYTES = 64
const MAX_MESSAGE_TEXT_LENGTH = 4096
const MAX_DISPLAY_LENGTH = 160

const FACTION_NAMES = new Map([
	['merc', 'Наёмник'],
	['covenant', 'Завет'],
	['freedom', 'Заря'],
	['duty', 'Долг'],
	['bandits', 'Бандит'],
	['stalkers', 'Сталкер'],
])

const CLAN_RANK_NAMES = new Map([
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

export function escapeHtml(value: string): string {
	return value.replace(/[&<>\"]/g, (character) => {
		switch (character) {
			case '&':
				return '&amp;'
			case '<':
				return '&lt;'
			case '>':
				return '&gt;'
			default:
				return '&quot;'
		}
	})
}

function truncate(value: string, maxLength: number): string {
	const characters = [...value]
	return characters.length > maxLength
		? `${characters.slice(0, maxLength - 1).join('')}…`
		: value
}

function normalize(value: unknown, maxLength = MAX_DISPLAY_LENGTH): string {
	const text =
		value === null || value === undefined || value === ''
			? '—'
			: String(value).replace(/\s+/g, ' ').trim()
	return truncate(text, maxLength)
}

function display(value: unknown, maxLength = MAX_DISPLAY_LENGTH): string {
	return escapeHtml(normalize(value, maxLength))
}

function entityLength(entity: string): number {
	if (/^&(amp|lt|gt|quot);$/.test(entity)) return 1
	if (/^&#(?:x[\da-f]+|\d+);$/i.test(entity)) return 1
	return [...entity].length
}

function htmlTextLength(value: string): number {
	let length = 0
	for (let index = 0; index < value.length; index += 1) {
		if (value[index] === '<') {
			const end = value.indexOf('>', index + 1)
			if (end !== -1) {
				index = end
				continue
			}
		}
		if (value[index] === '&') {
			const end = value.indexOf(';', index + 1)
			if (end !== -1) {
				const entity = value.slice(index, end + 1)
				if (
					/^&(?:amp|lt|gt|quot);$|^&#(?:x[\da-f]+|\d+);$/i.test(
						entity
					)
				) {
					length += entityLength(entity)
					index = end
					continue
				}
			}
		}
		const character = [...value.slice(index)][0]
		length += 1
		index += character.length - 1
	}
	return length
}

function limitRichHtml(value: string): string {
	if (htmlTextLength(value) <= MAX_MESSAGE_TEXT_LENGTH) return value

	const visibleLimit = MAX_MESSAGE_TEXT_LENGTH - 1
	let visibleLength = 0
	let output = ''
	const openTags: string[] = []
	for (
		let index = 0;
		index < value.length && visibleLength < visibleLimit;
	) {
		if (value[index] === '<') {
			const end = value.indexOf('>', index + 1)
			if (end !== -1) {
				const tag = value.slice(index, end + 1)
				output += tag
				const opening = tag.match(
					/^<(b|code|blockquote)(?: expandable)?>$/
				)
				const closing = tag.match(/^<\/(b|code|blockquote)>$/)
				if (opening) openTags.push(opening[1])
				if (closing) {
					const openIndex = openTags.lastIndexOf(closing[1])
					if (openIndex !== -1) openTags.splice(openIndex, 1)
				}
				index = end + 1
				continue
			}
		}
		if (value[index] === '&') {
			const end = value.indexOf(';', index + 1)
			if (end !== -1) {
				const entity = value.slice(index, end + 1)
				if (
					/^&(?:amp|lt|gt|quot);$|^&#(?:x[\da-f]+|\d+);$/i.test(
						entity
					)
				) {
					output += entity
					visibleLength += entityLength(entity)
					index = end + 1
					continue
				}
			}
		}
		const character = [...value.slice(index)][0]
		output += character
		visibleLength += 1
		index += character.length
	}
	output += '…'
	for (let index = openTags.length - 1; index >= 0; index -= 1) {
		output += `</${openTags[index]}>`
	}
	return output
}

function cardText(
	profile: PlayerProfile,
	region: Region,
	maxFieldLength = MAX_DISPLAY_LENGTH
): string {
	const metrics = extractMetrics(profile)
	const clan = profile.clan?.info?.name
	const clanTag = profile.clan?.info?.tag
	const clanText = clan ? `${clan}${clanTag ? ` [${clanTag}]` : ''}` : '—'
	const clanHistory = profile.clan_history ?? []
	const historyText = clanHistory.length
		? `<blockquote expandable>${clanHistory
				.map((entry) => {
					const name = `${entry.clan_name}${entry.clan_tag ? ` [${entry.clan_tag}]` : ''}`
					return `${display(name, maxFieldLength)} · ${display(mappedName(entry.rank, CLAN_RANK_NAMES))} · ${display(entry.region)} · ${display(formatDate(entry.joined_at ?? entry.seen_at))}`
				})
				.join('\n')}</blockquote>`
		: null

	return [
		`<b>${display(profile.username, maxFieldLength)}</b> (${display(region)})`,
		`Регион: <b>${display(region)}</b>`,
		'',
		`Фракция: ${display(mappedName(profile.alliance, FACTION_NAMES), maxFieldLength)}`,
		`Клан: ${display(clanText, maxFieldLength)}`,
		...(historyText ? ['', 'История кланов:', historyText] : []),
		'',
		`K/D: <b>${escapeHtml(formatMetric(metrics.kd))}</b>`,
		`K/D Противостояния: <b>${escapeHtml(formatMetric(metrics.battleKd))}</b>`,
		`Часы: <b>${escapeHtml(formatHours(metrics.hours))}</b>`,
		`Начал играть: <b>${display(formatDate(metrics.registeredAt), maxFieldLength)}</b>`,
		`Точность: <b>${escapeHtml(formatMetric(metrics.accuracy) + '%')}</b>`,
	].join('\n')
}

export function profileArticle(
	profile: PlayerProfile,
	region: Region,
	id = `${region}:${profile.username}`
): InlineArticle {
	const safeText = limitRichHtml(cardText(profile, region))
	const username = normalize(profile.username)
	return {
		type: 'article',
		id: resultId(id),
		title: `${username} (${region})`,
		description: `Профиль ${username} — K/D ${formatMetric(extractMetrics(profile).kd)}`,
		input_message_content: {
			message_text: safeText,
			parse_mode: 'HTML',
		},
		reply_markup: {
			inline_keyboard: [
				[
					{
						text: 'Открыть на StalHub',
						url: profileUrl(region, profile.username),
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
			message_text: limitRichHtml(
				escapeHtml(normalize(message, MAX_MESSAGE_TEXT_LENGTH))
			),
			parse_mode: 'HTML',
		},
	}
}

export function helpText(): string {
	return [
		'<b>StalHub Player Bot</b>',
		'',
		'В любом чате введите <code>@stalhubbot ник [регион]</code>.',
		'Без региона поиск выполняется в RU, EU, NA, SEA и NEA.',
		'Регион можно указать явно: <code>@stalhubbot Nick RU</code>.',
	].join('\n')
}
