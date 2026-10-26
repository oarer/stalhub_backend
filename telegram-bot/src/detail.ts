import { FormattableString } from 'gramio'
import type { BotConfig } from './config'
import { limitFormattable } from './format'

export type ItemMessage =
	| { type: 'text'; text: string }
	| { type: 'translation'; key?: string; lines?: Record<string, string> }

export type ItemElement =
	| { type: 'key-value'; key: ItemMessage; value: ItemMessage }
	| {
			type: 'numeric'
			name: ItemMessage
			value: number
			formatted?: { value?: Record<string, string> }
	  }
	| {
			type: 'range'
			name: ItemMessage
			min: number
			max: number
			formatted?: { value?: Record<string, string> }
	  }
	| {
			type: 'numericVariants'
			name: ItemMessage
			value: number[] | [number, number][]
	  }
	| {
			type: 'threshold'
			name: ItemMessage
			value: number
			limit: number
			formatted?: { value?: Record<string, string> }
	  }
	| { type: 'price'; currency: string; amount: number }
	| { type: 'item'; name: ItemMessage }
	| { type: 'text'; text: ItemMessage }
	| { type: 'usage'; name: ItemMessage }

export type ItemBlock =
	| { type: 'list' | 'addStat'; title: ItemMessage; elements: ItemElement[] }
	| {
			type: 'grouped'
			compact: ItemBlock[]
			detailed: ItemBlock[]
	  }
	| { type: 'text'; title: ItemMessage; text: ItemMessage }
	| {
			type: 'damage'
			startDamage: number
			damageDecreaseStart: number
			endDamage: number
			damageDecreaseEnd: number
			maxDistance: number
	  }
	| { type: 'show-all-toggle' }

export type ItemDetail = {
	id?: string
	category?: string
	name?: ItemMessage
	infoBlocks?: ItemBlock[]
	status?: { state?: string } | string
}

const STATUS_NAMES = new Map([
	['none', 'Не привязан'],
	['non_drop', 'Невыбрасываемый'],
	['personal_on_use', 'Привязывается при использовании'],
	['personal_on_get', 'Привязывается при получении'],
	['personal', 'Персональный'],
	['personal_until', 'Персональный на срок'],
	['personal_drop_on_get', 'Становится персональным при получении'],
	['personal_drop', 'Персональный, можно перепривязать'],
])

const HIDDEN_KEYS = new Set([
	'core.quality.common',
	'stalker.tooltip.artefact.not_probed',
	'stalker.tooltip.artefact.info.freshness',
	'stalker.tooltip.artefact.info.durability',
	'stalker.tooltip.artefact.info.max_durability',
	'stalker.lore.armor_artefact.info.compatible_backpacks',
	'general.armor.compatibility.backpacks.superheavy',
	'stalker.lore.armor_artefact.info.compatible_containers',
	'general.armor.compatibility.containers.bulky',
	'item.att.temp_model_armor.additional_stats_tip',
	'core.tooltip.stat_name.damage_type.direct',
	'weapon.lore.attachment.all_suitable_targets',
	'core.tooltip.info.durability',
	'core.tooltip.info.max_durability',
])

export const DETAIL_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const DETAIL_MISS_TTL_MS = 60 * 1000

export function messageToString(
	message: ItemMessage | undefined
): string | null {
	if (!message) return null
	if (typeof message !== 'object' || message === null) return null
	const clean = (value: string): string => value.replace(/\\n/g, '\n').trim()
	if (message.type === 'text') {
		const text = message.text
		return typeof text === 'string' && text.trim() ? clean(text) : null
	}
	if (message.type === 'translation') {
		const lines = message.lines ?? {}
		for (const locale of ['ru', 'en'] as const) {
			const line = lines[locale]
			if (typeof line === 'string' && line.trim()) return clean(line)
		}
		for (const line of Object.values(lines)) {
			if (typeof line === 'string' && line.trim()) return clean(line)
		}
		return null
	}
	return null
}

export function statusName(status: ItemDetail['status']): string | null {
	if (typeof status === 'string') {
		return STATUS_NAMES.get(status.trim().toLowerCase()) ?? null
	}
	const state = status?.state
	return typeof state === 'string'
		? (STATUS_NAMES.get(state.trim().toLowerCase()) ?? null)
		: null
}

function round(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function elementKeys(element: ItemElement): string[] {
	switch (element.type) {
		case 'key-value':
			return element.key.type === 'translation'
				? [element.key.key ?? '']
				: []
		case 'item':
			return element.name.type === 'translation'
				? [element.name.key ?? '']
				: []
		case 'text':
			return element.text.type === 'translation'
				? [element.text.key ?? '']
				: []
		case 'numeric':
		case 'range':
		case 'threshold':
			return element.name.type === 'translation'
				? [element.name.key ?? '']
				: []
		default:
			return []
	}
}

function isVisible(element: ItemElement): boolean {
	return !elementKeys(element).some((key) => key && HIDDEN_KEYS.has(key))
}

function formattedValue(element: {
	formatted?: { value?: Record<string, string> }
}): string | null {
	const value = element.formatted?.value?.ru
	return typeof value === 'string' && value.trim() ? value : null
}

function renderElement(element: ItemElement): string | null {
	const row = (key: string, value: string): string => `${key}: ${value}`
	switch (element.type) {
		case 'key-value': {
			const key = messageToString(element.key)
			const value = messageToString(element.value)
			return key && value ? row(key, value) : (value ?? key)
		}
		case 'numeric': {
			const name = messageToString(element.name)
			if (!name) return null
			return row(name, formattedValue(element) ?? round(element.value))
		}
		case 'range': {
			const name = messageToString(element.name)
			if (!name) return null
			return row(
				name,
				formattedValue(element) ??
					`${round(element.min)} — ${round(element.max)}`
			)
		}
		case 'numericVariants': {
			const name = messageToString(element.name)
			if (!name) return null
			const values = Array.isArray(element.value) ? element.value : []
			const current = values[0]
			const display = Array.isArray(current)
				? `${round(current[0])} — ${round(current[1])}`
				: typeof current === 'number'
					? round(current)
					: null
			return display ? row(name, display) : null
		}
		case 'threshold': {
			const name = messageToString(element.name)
			if (!name) return null
			return row(
				name,
				formattedValue(element) ??
					`${round(element.value)} / ${round(element.limit)}`
			)
		}
		case 'price': {
			const value = element.amount
			return `${element.currency}: ${round(value)}`
		}
		case 'item':
			return messageToString(element.name)
		case 'text':
			return messageToString(element.text)
		case 'usage':
			return messageToString(element.name)
		default:
			return null
	}
}

type Composed = {
	text: string
	entities: Array<{ type: string; offset: number; length: number }>
}

function compose(add: (writer: Composed) => void): Composed {
	const writer: Composed = { text: '', entities: [] }
	add(writer)
	return writer
}

function append(writer: Composed, value: string): void {
	writer.text += value
}

function wrap(writer: Composed, value: string, type: string): void {
	if (!value) return
	const offset = writer.text.length
	const length = [...value].length
	append(writer, value)
	writer.entities.push({ type, offset, length })
}

export function renderItemDetail(
	detail: ItemDetail,
	options: { fallbackName?: string } = {}
): FormattableString {
	const primary =
		messageToString(detail.name) ?? options.fallbackName ?? 'Предмет'
	const composed = compose((writer) => {
		wrap(writer, primary, 'bold')
		renderSections(writer, detail.infoBlocks)
	})
	return limitFormattable(
		FormattableString.from(
			composed.text,
			composed.entities as FormattableString['entities']
		)
	)
}

function renderSections(
	writer: Composed,
	blocks: ItemBlock[] | undefined
): void {
	if (!Array.isArray(blocks)) return
	for (const block of blocks) {
		if (block.type === 'show-all-toggle') continue
		if (block.type === 'grouped') {
			renderSections(writer, block.compact)
			renderSections(writer, block.detailed)
			continue
		}
		if (block.type === 'list' || block.type === 'addStat') {
			const title = messageToString(block.title)
			const lines = (Array.isArray(block.elements) ? block.elements : [])
				.filter(isVisible)
				.map(renderElement)
				.filter((line): line is string => Boolean(line))
			if (lines.length > 0) {
				append(writer, '\n\n')
				if (title && title.trim()) {
					wrap(writer, title, 'bold')
					append(writer, '\n')
				}
				wrap(writer, lines.join('\n'), 'expandable_blockquote')
			}
			continue
		}
		if (block.type === 'text') {
			const text = messageToString(block.text)
			if (!text) continue
			append(writer, '\n\n')
			if (text.length > 240) {
				wrap(writer, 'Описание', 'bold')
				append(writer, '\n')
				wrap(writer, text, 'expandable_blockquote')
			} else {
				append(writer, text)
			}
			continue
		}
		if (block.type === 'damage') {
			append(writer, '\n\n')
			wrap(writer, 'Урон', 'bold')
			append(
				writer,
				`: ${round(block.startDamage)} → ${round(block.endDamage)} на ${round(block.maxDistance)} м`
			)
		}
	}
}

export type ItemDetailResult = {
	text: string
	entities: FormattableString['entities']
	title: string
	pageUrl: string
}

export class ItemDetailCache {
	private readonly entries = new Map<
		string,
		{ expiresAt: number; detail: ItemDetail }
	>()
	private readonly misses = new Map<string, number>()
	private readonly inflight = new Map<string, Promise<ItemDetail>>()

	constructor(
		private readonly options: Pick<
			BotConfig,
			'dbUrl' | 'webAppUrl' | 'requestTimeoutMs'
		> & { fetchImpl?: typeof fetch }
	) {}

	get(category: string, id: string): Promise<ItemDetail> {
		const key = `${category}:${id}`
		const entry = this.entries.get(key)
		const now = Date.now()
		if (entry && entry.expiresAt > now) return Promise.resolve(entry.detail)
		const miss = this.misses.get(key)
		if (miss && miss > now) {
			return Promise.reject(new DetailLoadError(404))
		}
		const pending = this.inflight.get(key)
		if (pending) return pending
		const promise = this.load(category, id, key).finally(() => {
			this.inflight.delete(key)
		})
		this.inflight.set(key, promise)
		return promise
	}

	async detail(category: string, id: string): Promise<ItemDetailResult> {
		const detail = await this.get(category, id)
		const card = renderItemDetail(detail)
		return {
			text: card.text,
			entities: card.entities,
			title: messageToString(detail.name) ?? id,
			pageUrl: `${this.options.webAppUrl.replace(/\/$/, '')}/items/${category}/${id}`,
		}
	}

	private async load(
		category: string,
		id: string,
		key: string
	): Promise<ItemDetail> {
		try {
			const detail = await fetchItemDetail(this.options, category, id)
			this.entries.set(key, {
				expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
				detail,
			})
			return detail
		} catch (error) {
			if (error instanceof DetailLoadError && error.status === 404) {
				this.misses.set(key, Date.now() + DETAIL_MISS_TTL_MS)
				throw error
			}
			throw error
		}
	}
}

export class DetailLoadError extends Error {
	constructor(
		public readonly status: number,
		message = 'Предмет недоступен'
	) {
		super(message)
		this.name = 'DetailLoadError'
	}
}

async function fetchItemDetail(
	options: Pick<BotConfig, 'dbUrl' | 'requestTimeoutMs'> & {
		fetchImpl?: typeof fetch
	},
	category: string,
	id: string
): Promise<ItemDetail> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), options.requestTimeoutMs)
	try {
		const response = await (options.fetchImpl ?? fetch)(
			`${options.dbUrl.replace(/\/$/, '')}/items/${category}/${encodeURIComponent(id)}.json`,
			{ signal: controller.signal }
		)
		if (!response.ok) {
			throw new DetailLoadError(
				response.status,
				`Детали предмета ${response.status}`
			)
		}
		return (await response.json()) as ItemDetail
	} catch (error) {
		if (error instanceof DetailLoadError) throw error
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new DetailLoadError(504)
		}
		throw new DetailLoadError(502)
	} finally {
		clearTimeout(timer)
	}
}
