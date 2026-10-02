import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { ParsedQuote } from './format'

export interface DevCommentRecord {
	postId: string
	author: string
	link: string
	slug: string | null
	postNumber: number | null
	forumCreatedAt: string | null
	contentHtml: string
	telegramHtml: string
	plainText: string
	quotes: ParsedQuote[]
	responseHtml: string
	checkedAt: string
}

interface StoreFile {
	updatedAt: string
	lastIds: Record<string, string>
	items: DevCommentRecord[]
}

const HISTORY_PATH = resolve(process.cwd(), 'runtime/eforum/history.json')
const MAX_ITEMS = 500

let mem: StoreFile | null = null

function blank(): StoreFile {
	return { updatedAt: new Date().toISOString(), lastIds: {}, items: [] }
}

function load(): StoreFile {
	if (mem) return mem
	try {
		const raw = readFileSync(HISTORY_PATH, 'utf-8')
		const parsed = JSON.parse(raw) as StoreFile
		mem = {
			updatedAt: parsed.updatedAt ?? new Date().toISOString(),
			lastIds: parsed.lastIds ?? {},
			items: Array.isArray(parsed.items) ? parsed.items : [],
		}
	} catch {
		mem = blank()
	}
	return mem!
}

function save(): void {
	const data = load()
	data.updatedAt = new Date().toISOString()
	try {
		mkdirSync(dirname(HISTORY_PATH), { recursive: true })
		writeFileSync(
			HISTORY_PATH,
			JSON.stringify(data, null, 2),
			'utf-8'
		)
	} catch (err) {
		console.error('[EForum] failed to save history:', err)
	}
}

export function getLastIds(): Record<string, string> {
	return { ...load().lastIds }
}

export function setLastId(author: string, postId: string): void {
	load().lastIds[author] = postId
	save()
}

export function hasSeen(author: string, postId: string): boolean {
	return load().lastIds[author] === postId
}

export function appendRecord(
	record: DevCommentRecord
): { record: DevCommentRecord; isNew: boolean } {
	const store = load()
	const exists = store.items.some((i) => i.postId === record.postId)
	if (!exists) {
		store.items.unshift(record)
		if (store.items.length > MAX_ITEMS) {
			store.items.length = MAX_ITEMS
		}
	}
	store.lastIds[record.author] = record.postId
	save()
	return { record, isNew: !exists }
}

export interface HistoryQuery {
	author?: string
	authors?: string[]
	limit?: number
	offset?: number
	since?: string
}

export function readHistory(
	opts: HistoryQuery = {}
): { total: number; items: DevCommentRecord[]; updatedAt: string } {
	const { author, authors, limit = 20, offset = 0, since } = opts
	const safeLimit = Math.min(Math.max(limit, 1), 100)
	const safeOffset = Math.max(offset, 0)
	const store = load()

	const nameSet =
		authors && authors.length > 0
			? new Set(authors)
			: author
				? new Set([author])
				: null

	const sinceTs = since ? Date.parse(since) : NaN

	const filtered = store.items.filter((i) => {
		if (nameSet && !nameSet.has(i.author)) return false
		if (!Number.isNaN(sinceTs)) {
			const ts = Date.parse(i.forumCreatedAt ?? i.checkedAt)
			if (Number.isNaN(ts) || ts <= sinceTs) return false
		}
		return true
	})
	return {
		total: filtered.length,
		items: filtered.slice(safeOffset, safeOffset + safeLimit),
		updatedAt: store.updatedAt,
	}
}

export function findByPostId(postId: string): DevCommentRecord | null {
	return load().items.find((i) => i.postId === postId) ?? null
}

export function getStoreStatus(): {
	updatedAt: string
	trackedCount: number
	storedCount: number
} {
	const store = load()
	return {
		updatedAt: store.updatedAt,
		trackedCount: Object.keys(store.lastIds).length,
		storedCount: store.items.length,
	}
}
