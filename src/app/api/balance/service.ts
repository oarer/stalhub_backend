import { getItemDiff, readDiffFile, saveDiffFile } from './diffs'
import {
	downloadListing,
	hashSnapshot,
	isSnapshotReady,
	type ListingSnapshot,
	loadSnapshot,
	saveSnapshot,
} from './listing'
import type { Changes, ItemCategory, ItemData } from './types'

interface BalanceCache {
	updatedAt: number
	loc: string | null
	remote: string | null
	ref: string | null
	changes: Changes
}

let cache: BalanceCache | null = null
let updatePromise: Promise<Changes | null> | null = null

const CACHE_TTL_MS = 60 * 1000

const REF = 'merged/listing'

function isSameItem(a: ItemData, b: ItemData): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

function collectDiff(
	oldSnapshot: ListingSnapshot,
	newSnapshot: ListingSnapshot
): Changes {
	const itemChanges: Changes = []

	for (const [category, newItems] of Object.entries(newSnapshot) as [
		ItemCategory,
		Record<string, ItemData>,
	][]) {
		const oldItems = oldSnapshot[category] ?? {}

		for (const [id, newData] of Object.entries(newItems)) {
			const oldData = oldItems[id]
			if (oldData && isSameItem(oldData, newData)) continue

			const itemChange = getItemDiff(category, id, oldData ?? {}, newData)
			if (itemChange) itemChanges.push(itemChange)
		}
	}

	return itemChanges
}

export async function refreshBalanceDiffs(
	force = false
): Promise<Changes | null> {
	if (updatePromise) {
		await updatePromise
		return cache?.changes ?? null
	}

	const startedAt = Date.now()
	const task = (async () => {
		try {
			const newSnapshot = await downloadListing()
			const newHash = hashSnapshot(newSnapshot)

			if (!isSnapshotReady()) {
				saveSnapshot(newSnapshot)
				const lastDiff = readDiffFile() ?? []
				cache = {
					updatedAt: startedAt,
					loc: null,
					remote: newHash,
					ref: REF,
					changes: lastDiff,
				}
				return cache.changes
			}

			const oldSnapshot = loadSnapshot()
			const oldHash = hashSnapshot(oldSnapshot)

			if (!force && oldHash === newHash) {
				const lastDiff = readDiffFile() ?? []
				cache = {
					updatedAt: startedAt,
					loc: oldHash,
					remote: newHash,
					ref: REF,
					changes: lastDiff,
				}
				return cache.changes
			}

			const itemChanges = collectDiff(oldSnapshot, newSnapshot)
			if (itemChanges.length > 0) {
				saveDiffFile(itemChanges)
			}
			saveSnapshot(newSnapshot)

			cache = {
				updatedAt: startedAt,
				loc: oldHash,
				remote: newHash,
				ref: REF,
				changes: itemChanges,
			}
			return itemChanges
		} catch (error) {
			console.error('[Balance] Failed to refresh balance diffs:', error)
			cache = {
				updatedAt: startedAt,
				loc: null,
				remote: null,
				ref: REF,
				changes: readDiffFile() ?? [],
			}
			return cache.changes
		}
	})()

	updatePromise = task
	try {
		return await task
	} finally {
		updatePromise = null
	}
}

export async function readBalanceDiffs(): Promise<Changes | null> {
	if (cache && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
		return cache.changes
	}
	const changes = readDiffFile()
	if (changes) {
		cache = {
			updatedAt: Date.now(),
			loc: cache?.loc ?? null,
			remote: cache?.remote ?? null,
			ref: REF,
			changes,
		}
	}
	return changes
}

export function getBalanceStatus(): {
	loc: string | null
	remote: string | null
	ref: string | null
	fresh: boolean
} {
	return {
		loc: cache?.loc ?? null,
		remote: cache?.remote ?? null,
		ref: cache?.ref ?? null,
		fresh: cache ? Date.now() - cache.updatedAt < CACHE_TTL_MS : false,
	}
}
