import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseJsonObject } from './parse-json'
import type { ItemNames, LocaleCode } from './types'

export const LOCALES: LocaleCode[] = ['ru', 'en', 'es', 'fr', 'ko']

export type LocaleNames = Record<LocaleCode, Record<string, string>>

interface LangFile {
	file: string
	locale: LocaleCode
}

export function findLangFiles(langDir: string): LangFile[] {
	if (!langDir) {
		return []
	}

	try {
		const entries = readdirSync(langDir)
		const files: LangFile[] = []
		for (const entry of entries) {
			const loc = entry.replace(/\.lang$/, '')
			if (LOCALES.includes(loc as LocaleCode)) {
				files.push({
					file: join(langDir, entry),
					locale: loc as LocaleCode,
				})
			}
		}
		return files
	} catch {
		return []
	}
}

export function parseLangFile(file: string): Record<string, string> {
	const names: Record<string, string> = {}
	let raw: string
	try {
		raw = readFileSync(file, 'utf8')
	} catch {
		return names
	}

	for (const line of raw.split('\n')) {
		if (line.length === 0) {
			continue
		}
		const idx = line.indexOf('.name=')
		if (idx === -1) {
			continue
		}
		const key = line.slice(0, idx)
		const value = line.slice(idx + '.name='.length)
		if (value.length > 0) {
			names[`${key}.name`] = value
		}
	}

	return names
}

export function loadLocaleNames(langDir: string): LocaleNames {
	const result: LocaleNames = {
		ru: {},
		en: {},
		es: {},
		fr: {},
		ko: {},
	}

	for (const { file, locale } of findLangFiles(langDir)) {
		result[locale] = parseLangFile(file)
	}

	return result
}

function walkJson(
	value: unknown,
	visit: (node: Record<string, unknown>) => void
): void {
	if (Array.isArray(value)) {
		for (const item of value) {
			walkJson(item, visit)
		}
		return
	}

	if (typeof value === 'object' && value !== null) {
		visit(value as Record<string, unknown>)
		for (const child of Object.values(value)) {
			walkJson(child, visit)
		}
	}
}

export function loadIdToUnlocalizedName(
	itemDirs: string[]
): Map<number, string> {
	const map = new Map<number, string>()

	for (const dir of itemDirs) {
		if (!dir) {
			continue
		}

		const files = collectJsonFiles(dir)
		for (const file of files) {
			let raw: string
			try {
				raw = readFileSync(file, 'utf8')
			} catch {
				continue
			}

			let root: unknown
			try {
				root = parseJsonObject<unknown>(raw)
			} catch {
				continue
			}

			walkJson(root, (node) => {
				const itemId = node.item_id
				const unlocalized = node.unlocalized_name
				if (
					typeof itemId === 'number' &&
					typeof unlocalized === 'string'
				) {
					if (!map.has(itemId)) {
						map.set(itemId, unlocalized)
					}
				}
			})
		}
	}

	return map
}

function collectJsonFiles(dir: string): string[] {
	const files: string[] = []
	try {
		const entries = readdirSync(dir)
		for (const entry of entries) {
			const full = join(dir, entry)
			let stat
			try {
				stat = statSync(full)
			} catch {
				continue
			}
			if (stat.isDirectory()) {
				files.push(...collectJsonFiles(full))
			} else if (entry.endsWith('.json')) {
				files.push(full)
			}
		}
	} catch {
		// ignore unreadable dirs
	}
	return files
}

const normalizeKey = (raw: string | unknown): string | undefined => {
	if (typeof raw !== 'string' || raw.length === 0) {
		return undefined
	}
	return raw.endsWith('.name') ? raw : `${raw}.name`
}

export interface PackageMaps {
	nameKeyByNumericId: Map<number, string>
	nameKeyByStringId: Map<string, string>
	titleKeyByLoot: Map<string, string>
	titleKeyByBag: Map<string, string>
}

export const emptyPackageMaps = (): PackageMaps => ({
	nameKeyByNumericId: new Map(),
	nameKeyByStringId: new Map(),
	titleKeyByLoot: new Map(),
	titleKeyByBag: new Map(),
})

export function findPackagesFiles(itemDirs: string[]): string[] {
	const files: string[] = []
	for (const dir of itemDirs) {
		if (!dir) {
			continue
		}
		for (const file of collectJsonFiles(dir)) {
			if (file.endsWith('packages.json')) {
				files.push(file)
			}
		}
	}
	return files
}

const setIfAbsent = <T>(map: Map<T, string>, key: T, value: string): void => {
	if (!map.has(key)) {
		map.set(key, value)
	}
}

export function loadPackages(packagePaths: string[]): PackageMaps {
	const maps = emptyPackageMaps()

	for (const path of packagePaths) {
		let raw: string
		try {
			raw = readFileSync(path, 'utf8')
		} catch {
			continue
		}

		let data: unknown
		try {
			data = parseJsonObject<unknown>(raw)
		} catch {
			continue
		}

		const entries = Array.isArray(data) ? data : [data]
		for (const entry of entries) {
			if (typeof entry !== 'object' || entry === null) {
				continue
			}
			const node = entry as Record<string, unknown>

			const itemId =
				typeof node.item_id === 'number'
					? Math.trunc(node.item_id)
					: undefined
			const unlocalized =
				typeof node.unlocalized_name === 'string'
					? node.unlocalized_name
					: undefined
			const nameKey =
				normalizeKey(node.name) ??
				(unlocalized
					? `item.${unlocalized}.name`
					: itemId
						? `item.${itemId}.name`
						: undefined)

			if (nameKey === undefined) {
				continue
			}

			if (itemId !== undefined) {
				setIfAbsent(maps.nameKeyByNumericId, itemId, nameKey)
			}
			if (unlocalized) {
				setIfAbsent(maps.nameKeyByStringId, unlocalized, nameKey)
			}
			if (typeof node.loot === 'string') {
				setIfAbsent(maps.titleKeyByLoot, node.loot, nameKey)
			}
			if (typeof node.shufflebag === 'string') {
				setIfAbsent(maps.titleKeyByBag, node.shufflebag, nameKey)
			}
		}
	}

	return maps
}

export function namesForFullKey(
	localeNames: LocaleNames,
	fullKey: string
): ItemNames | undefined {
	const names: ItemNames = {}
	let found = false

	for (const locale of LOCALES) {
		const value = localeNames[locale][fullKey]
		if (value) {
			names[locale] = value
			found = true
		}
	}

	return found ? names : undefined
}

export function resolveItemNames(
	id: string | number | null,
	localeNames: LocaleNames,
	idToUnlocalized: Map<number, string>,
	packageMaps: PackageMaps
): ItemNames | undefined {
	if (id === null) {
		return undefined
	}

	if (typeof id === 'string') {
		return (
			namesForFullKey(localeNames, `item.${id}.name`) ??
			namesForFullKey(
				localeNames,
				packageMaps.nameKeyByStringId.get(id) ?? ''
			) ??
			undefined
		)
	}

	const unlocalized = idToUnlocalized.get(id)
	return (
		namesForFullKey(localeNames, `item.${id}.name`) ??
		namesForFullKey(
			localeNames,
			packageMaps.nameKeyByNumericId.get(id) ?? ''
		) ??
		(unlocalized
			? namesForFullKey(localeNames, `item.${unlocalized}.name`)
			: undefined) ??
		undefined
	)
}

export function resolveTableTitle(
	tableName: string,
	localeNames: LocaleNames,
	packageMaps: PackageMaps
): ItemNames | undefined {
	const pkgKey =
		packageMaps.titleKeyByLoot.get(tableName) ??
		packageMaps.titleKeyByBag.get(tableName)

	return (
		(pkgKey ? namesForFullKey(localeNames, pkgKey) : undefined) ??
		roundTripKey(tableName, localeNames) ??
		undefined
	)
}

function roundTripKey(
	tableName: string,
	localeNames: LocaleNames
): ItemNames | undefined {
	return namesForFullKey(localeNames, `item.${tableName}.name`)
}
