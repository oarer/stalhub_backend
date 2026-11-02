import {
	downloadListing,
	isSnapshotReady,
	loadSnapshot,
} from '@/app/api/balance/listing'
import type { ItemData } from '@/app/api/balance/types'
import type { UnoItemDbInfo, UnoItemLookup } from '@/types/uno.type'

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeName(name: string): string {
	return name
		.normalize('NFKC')
		.toLocaleLowerCase('ru')
		.replace(/ё/g, 'е')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function itemNames(item: ItemData): {
	display: string | null
	keys: string[]
} {
	const name = asRecord(item.name)
	const lines = asRecord(name?.lines)
	if (!lines) return { display: null, keys: [] }

	const display =
		typeof lines.ru === 'string'
			? lines.ru
			: typeof lines.en === 'string'
				? lines.en
				: null

	const keys = Object.values(lines)
		.filter((value): value is string => typeof value === 'string')
		.map(normalizeName)
		.filter(Boolean)

	return { display, keys: [...new Set(keys)] }
}

async function buildIndex(): Promise<Map<string, UnoItemDbInfo[]>> {
	let snapshot = loadSnapshot()

	if (!isSnapshotReady()) {
		try {
			snapshot = await downloadListing()
		} catch (error) {
			console.error('[uno] failed to load item listing:', error)
			return new Map()
		}
	}

	const index = new Map<string, UnoItemDbInfo[]>()

	for (const [type, items] of Object.entries(snapshot)) {
		for (const [id, item] of Object.entries(items)) {
			const { display, keys } = itemNames(item)
			if (!display || keys.length === 0) continue

			const status = asRecord(item.status)

			const entry: UnoItemDbInfo = {
				id,
				name: display,
				category: asString(item.category),
				type,
				color: asString(item.color),
				state: asString(status?.state),
			}

			for (const key of keys) {
				const entries = index.get(key) ?? []
				entries.push(entry)
				index.set(key, entries)
			}
		}
	}

	return index
}

let indexPromise: Promise<Map<string, UnoItemDbInfo[]>> | null = null

export function getUnoItemLookup(): Promise<UnoItemLookup> {
	if (!indexPromise) indexPromise = buildIndex()

	return indexPromise.then((index) => (name, expectedCategory) => {
		if (!name) return null

		const entries = index.get(normalizeName(name))
		if (!entries || entries.length === 0) return null

		if (expectedCategory) {
			const match = entries.find(
				(entry) => entry.type === expectedCategory
			)
			if (match) return match
		}

		return entries[0] ?? null
	})
}
