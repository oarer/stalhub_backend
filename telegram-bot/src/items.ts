import type { BotConfig } from './config'

export class DbLoadError extends Error {
	constructor(
		public readonly status: number,
		message = 'Listing request failed'
	) {
		super(message)
		this.name = 'DbLoadError'
	}
}

export type LocalizedName = Partial<{
	ru: string
	en: string
	es: string
	fr: string
	ko: string
}>

export type ListedItem = {
	category: string
	id: string
	name: LocalizedName
	color: string
	iconUrl: string | null
	pageUrl: string
}

export type ItemLookup = {
	search(query: string, limit?: number): Promise<ListedItem[]>
}

const ITEM_RANK_NAMES = new Map([
	['rank_newbie', 'Стажёр'],
	['rank_stalker', 'Сталкер'],
	['rank_veteran', 'Ветеран'],
	['rank_master', 'Мастер'],
	['rank_legend', 'Легенда'],
	['quest_item', 'Квестовый предмет'],
])

const RANK_PRIORITY = new Map([
	['rank_legend', 5],
	['rank_master', 4],
	['rank_veteran', 3],
	['rank_stalker', 2],
	['rank_newbie', 1],
])

export function rankName(color: string): string | null {
	return ITEM_RANK_NAMES.get(color.trim().toLowerCase()) ?? null
}

export function rankPriority(color: string): number {
	return RANK_PRIORITY.get(color.trim().toLowerCase()) ?? 0
}

export function normalizeItemName(value: string): string {
	return value
		.toLowerCase()
		.replace(/[«»"'’]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function parseCategory(data: string): { category: string; id: string } | null {
	const match = data.match(/^\/items\/(.+?)\/([^/]+?)(?:\.[a-z]+)?$/)
	return match ? { category: match[1], id: match[2] } : null
}

function absoluteUrl(base: string, path: string | undefined): string | null {
	if (!path) return null
	if (path.startsWith('http://') || path.startsWith('https://')) return path
	const joined = `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
	return /^https?:\/\//.test(joined) ? joined : null
}

type ListingEntry = {
	data?: unknown
	icon?: unknown
	name?: unknown
	color?: unknown
}

export function parseListing(
	raw: unknown,
	options: { dbUrl: string; webAppUrl: string }
): ListedItem[] {
	if (!Array.isArray(raw)) throw new Error('Listing payload is not an array')
	const items: ListedItem[] = []
	for (const rawEntry of raw) {
		const entry = rawEntry as ListingEntry
		if (typeof entry?.data !== 'string') continue
		const parsed = parseCategory(entry.data)
		if (!parsed) continue
		const name =
			entry.name && typeof entry.name === 'object'
				? (entry.name as LocalizedName)
				: {}
		items.push({
			category: parsed.category,
			id: parsed.id,
			name,
			color: typeof entry.color === 'string' ? entry.color : 'DEFAULT',
			iconUrl: absoluteUrl(
				options.dbUrl,
				typeof entry.icon === 'string' ? entry.icon : undefined
			),
			pageUrl: `${options.webAppUrl.replace(/\/$/, '')}/items/${parsed.category}/${parsed.id}`,
		})
	}
	return items
}

type Candidate = {
	item: ListedItem
	length: number
	priority: number
}

const MATCH_INCLUDES = 1
const MATCH_PREFIX = 2

function matchKind(value: string, query: string): number {
	if (value.startsWith(query)) return MATCH_PREFIX
	if (value.includes(query)) return MATCH_INCLUDES
	return 0
}

export function searchItems(
	entries: ListedItem[],
	query: string,
	limit = 8
): ListedItem[] {
	const normalized = normalizeItemName(query)
	if (!normalized || normalisedLimit(limit) === 0) return []
	if (entries.length === 0) return []

	const prefixCandidates: Candidate[] = []
	const suffixCandidates: Candidate[] = []

	for (const item of entries) {
		const ru =
			typeof item.name.ru === 'string'
				? normalizeItemName(item.name.ru)
				: null
		const en =
			typeof item.name.en === 'string'
				? normalizeItemName(item.name.en)
				: null
		const kind = (value: string | null): number =>
			value === null ? 0 : matchKind(value, normalized)
		const ruKind = kind(ru)
		const enKind = kind(en)
		if (ruKind === 0 && enKind === 0) continue
		for (const [value, valueKind] of [
			[ru, ruKind],
			[en, enKind],
		] as const) {
			if (valueKind === 0 || value === null) continue
			const target =
				valueKind === MATCH_PREFIX ? prefixCandidates : suffixCandidates
			target.push({
				item,
				length: value.length,
				priority: rankPriority(item.color),
			})
		}
	}

	const byRank = (a: Candidate, b: Candidate): number =>
		b.priority - a.priority || a.length - b.length
	prefixCandidates.sort(byRank)
	suffixCandidates.sort(byRank)

	const seen = new Set<string>()
	const results: ListedItem[] = []
	for (const { item } of [...prefixCandidates, ...suffixCandidates]) {
		const key = `${item.category}:${item.id}`
		if (seen.has(key)) continue
		seen.add(key)
		results.push(item)
		if (results.length >= limit) break
	}
	return results
}

function normalisedLimit(limit: number): number {
	return Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 8
}

async function fetchListing(options: {
	dbUrl: string
	requestTimeoutMs: number
	fetchImpl?: typeof fetch
}): Promise<unknown> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), options.requestTimeoutMs)
	try {
		const response = await (options.fetchImpl ?? fetch)(
			`${options.dbUrl.replace(/\/$/, '')}/listing.json`,
			{ signal: controller.signal }
		)
		if (!response.ok)
			throw new DbLoadError(
				response.status,
				`Listing request ${response.status}`
			)
		return await response.json()
	} catch (error) {
		if (error instanceof DbLoadError) throw error
		if (error instanceof DOMException && error.name === 'AbortError')
			throw new DbLoadError(504, 'Listing request timed out')
		throw new DbLoadError(502, 'Listing request failed')
	} finally {
		clearTimeout(timer)
	}
}

const RETRY_DELAY_MS = 60_000

export class ItemDatabase implements ItemLookup {
	private entries: ListedItem[] = []
	private loadedAt = 0
	private retryAllowedAt = 0
	private inflight: Promise<void> | null = null

	constructor(
		private readonly options: Pick<
			BotConfig,
			'dbUrl' | 'webAppUrl' | 'requestTimeoutMs' | 'itemsRefreshMs'
		> & { fetchImpl?: typeof fetch }
	) {}

	async search(query: string, limit = 8): Promise<ListedItem[]> {
		if (this.entries.length === 0) await this.refresh()
		else void this.refreshIfStale()
		return searchItems(this.entries, query, limit)
	}

	private refreshIfStale(): Promise<void> | null {
		if (Date.now() - this.loadedAt < this.options.itemsRefreshMs)
			return null
		return this.refresh()
	}

	private refresh(): Promise<void> {
		if (Date.now() < this.retryAllowedAt) {
			return this.inflight ?? Promise.resolve()
		}
		if (!this.inflight) {
			this.inflight = this.load().finally(() => {
				this.inflight = null
			})
		}
		return this.inflight
	}

	private async load(): Promise<void> {
		try {
			const raw = await fetchListing(this.options)
			this.entries = parseListing(raw, this.options)
			this.loadedAt = Date.now()
		} catch (error) {
			this.retryAllowedAt = Date.now() + RETRY_DELAY_MS
			if (this.entries.length === 0) throw error
		}
	}
}
