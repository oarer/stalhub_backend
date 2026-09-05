import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	findPackagesFiles,
	type LocaleNames,
	loadIdToUnlocalizedName,
	loadLocaleNames,
	loadPackages,
	type PackageMaps,
	resolveItemNames,
	resolveTableTitle,
} from './names'
import { parseJsonObject } from './parse-json'
import {
	type Catalog,
	catalogItemFromNormalized,
	type NormalizedSlotItem,
	normalizeGroupSlot,
	normalizeSlot,
	normalizeSlotItem,
	type RawGroup,
} from './types'

export interface LootSources {
	lootDir: string
	shufflebagsDir: string
	itemDirs: string[]
	langDir: string
}

export interface CatalogResult {
	catalog: Catalog
	sourceFileCount: number
	tableCount: number
	slotCount: number
	itemCount: number
}

interface ShuffleEntry {
	amount?: unknown
	stack?: unknown
	loot?: unknown
	bag?: unknown
	weight?: unknown
}

type ShuffleBag = Record<string, ShuffleEntry[]>

const round = (value: number): number => Math.round(value * 1e6) / 1e6

function readJsonFiles(
	dir: string
): Array<{ file: string; data: Record<string, unknown> }> {
	const result: Array<{ file: string; data: Record<string, unknown> }> = []
	if (!dir) {
		return result
	}

	let files: string[] = []
	try {
		files = readdirSync(dir).filter((f) => f.endsWith('.json'))
	} catch {
		return result
	}

	for (const file of files) {
		const full = join(dir, file)
		let raw: string
		try {
			raw = readFileSync(full, 'utf8')
		} catch {
			continue
		}

		let data: unknown
		try {
			data = parseJsonObject<unknown>(raw)
		} catch {
			continue
		}

		if (typeof data === 'object' && data !== null) {
			result.push({ file: full, data: data as Record<string, unknown> })
		}
	}

	return result
}

function loadShufflebags(shufflebagsDir: string): ShuffleBag {
	const bags: ShuffleBag = {}
	for (const { data } of readJsonFiles(shufflebagsDir)) {
		for (const [name, value] of Object.entries(data)) {
			if (Array.isArray(value)) {
				bags[name] = value as ShuffleEntry[]
			}
		}
	}
	return bags
}

function flattenTableWeighted(
	rawTables: Map<string, NormalizedSlotItem[][]>,
	name: string
): NormalizedSlotItem[] | undefined {
	const table = rawTables.get(name)
	if (!table) {
		return undefined
	}

	const flattened: NormalizedSlotItem[] = []
	for (const slot of table) {
		flattened.push(...slot)
	}
	return flattened
}

function itemKey(item: NormalizedSlotItem): string {
	return JSON.stringify({
		id: item.id,
		stackSize: item.stackSize,
		tag: item.tag ?? null,
		stackSizeVariance: item.stackSizeVariance ?? null,
	})
}

function resolveBag(
	bagName: string,
	bags: ShuffleBag,
	rawTables: Map<string, NormalizedSlotItem[][]>,
	visited: Set<string>,
	scale: number
): NormalizedSlotItem[] {
	if (visited.has(bagName)) {
		return []
	}

	const entries = bags[bagName] ?? []
	const totalPapers = entries.reduce(
		(sum, e) => sum + (typeof e.amount === 'number' ? e.amount : 1),
		0
	)
	if (totalPapers <= 0) {
		return []
	}

	visited.add(bagName)
	const acc = new Map<string, NormalizedSlotItem>()

	const addMass = (item: NormalizedSlotItem, mass: number): void => {
		if (mass <= 0) {
			return
		}
		const key = itemKey(item)
		const existing = acc.get(key)
		if (existing) {
			existing.weight += mass
		} else {
			acc.set(key, { ...item, weight: mass })
		}
	}

	for (const entry of entries) {
		const paperCount = typeof entry.amount === 'number' ? entry.amount : 1
		const fraction = (paperCount / totalPapers) * scale
		if (fraction <= 0) {
			continue
		}

		if (typeof entry.stack === 'object' && entry.stack !== null) {
			const item = normalizeSlotItem({
				stack: entry.stack,
				weight: entry.weight,
			})
			if (item !== null) {
				addMass(item, fraction)
			}
			continue
		}

		if (typeof entry.loot === 'string') {
			const table = flattenTableWeighted(rawTables, entry.loot)
			if (table) {
				const totalWeight = table.reduce(
					(sum, it) => sum + it.weight,
					0
				)
				if (totalWeight > 0) {
					for (const it of table) {
						addMass(it, fraction * (it.weight / totalWeight))
					}
				}
			}
			continue
		}

		if (typeof entry.bag === 'string') {
			const sub = resolveBag(entry.bag, bags, rawTables, visited, 1)
			for (const it of sub) {
				addMass(it, fraction * it.weight)
			}
		}
	}

	visited.delete(bagName)

	const items: NormalizedSlotItem[] = []
	for (const item of acc.values()) {
		items.push({ ...item, weight: round(item.weight) })
	}
	return items
}

export function buildCatalog(sources: LootSources): CatalogResult {
	const localeNames: LocaleNames = loadLocaleNames(sources.langDir)
	const idToUnlocalized = loadIdToUnlocalizedName(sources.itemDirs)
	const packageMaps: PackageMaps = loadPackages(
		findPackagesFiles(sources.itemDirs)
	)

	const rawTables = new Map<string, NormalizedSlotItem[][]>()

	let sourceFileCount = 0
	let slotCount = 0
	let itemCount = 0

	for (const { data } of readJsonFiles(sources.lootDir)) {
		sourceFileCount += 1
		for (const [name, value] of Object.entries(data)) {
			if (!Array.isArray(value)) {
				continue
			}

			const slots: NormalizedSlotItem[][] = []
			for (const slotOrGroup of value) {
				if (Array.isArray(slotOrGroup)) {
					const slot = normalizeSlot(slotOrGroup)
					if (slot.length > 0) {
						slots.push(slot)
					}
				} else if (
					typeof slotOrGroup === 'object' &&
					slotOrGroup !== null
				) {
					const slot = normalizeGroupSlot(slotOrGroup as RawGroup)
					if (slot.length > 0) {
						slots.push(slot)
					}
				}
			}

			const existing = rawTables.get(name)
			if (existing) {
				existing.push(...slots)
			} else {
				rawTables.set(name, slots)
			}
		}
	}

	const bags = loadShufflebags(sources.shufflebagsDir)
	for (const bagName of Object.keys(bags)) {
		const items = resolveBag(bagName, bags, rawTables, new Set(), 1)
		if (items.length > 0) {
			rawTables.set(bagName, [items])
		}
	}

	const catalog: Catalog = {}
	for (const [name, slots] of rawTables) {
		const title =
			resolveTableTitle(name, localeNames, packageMaps) ?? undefined
		const table = slots.map((slot) => {
			const sum = slot.reduce((acc, item) => acc + item.weight, 0)
			return slot.map((item) => {
				const names = resolveItemNames(
					item.id,
					localeNames,
					idToUnlocalized,
					packageMaps
				)
				const catalogItem = catalogItemFromNormalized(item, names)
				catalogItem.pct = sum > 0 ? round((item.weight / sum) * 100) : 0
				return catalogItem
			})
		})
		catalog[name] = {
			title,
			slots: table,
		}
		slotCount += table.length
		itemCount += table.reduce((sum, slot) => sum + slot.length, 0)
	}

	return {
		catalog,
		sourceFileCount,
		tableCount: Object.keys(catalog).length,
		slotCount,
		itemCount,
	}
}
