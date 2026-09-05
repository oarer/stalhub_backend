import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { balanceConfig } from './config'
import { getComparisonForCategory } from './parsers'
import type { Changes, ItemCategory, ItemChange, ItemData } from './types'

function resolveItemName(
	newData: ItemData,
	oldData: ItemData,
	lang = 'ru'
): string {
	const pickFrom = (data: ItemData | undefined): string | undefined => {
		if (!data || typeof data !== 'object') return undefined

		const lines = data.name?.lines
		if (lines && typeof lines === 'object') {
			for (const key of [lang, 'ru', 'en']) {
				const value = lines[key]
				if (typeof value === 'string' && value.trim())
					return value.trim()
			}
			for (const value of Object.values(lines)) {
				if (typeof value === 'string' && value.trim())
					return value.trim()
			}
		}

		const nameKey = data.name?.key
		if (typeof nameKey === 'string' && nameKey.trim()) return nameKey.trim()
		return undefined
	}

	const fromNew = pickFrom(newData)
	if (fromNew) return fromNew

	const fromOld = pickFrom(oldData)
	if (fromOld) return fromOld

	return 'Неизвестный предмет'
}

export function getItemDiff(
	category: ItemCategory,
	id: string,
	oldData: ItemData,
	newData: ItemData,
	lang = 'ru'
): ItemChange | null {
	const comparison = getComparisonForCategory(category)
	if (!comparison) return null

	try {
		const changes = comparison(oldData, newData, lang)
		if (changes.length === 0) return null

		const itemName = resolveItemName(newData, oldData, lang)
		return {
			path: `${category}/${id}`,
			category,
			name: itemName,
			changes,
		}
	} catch {
		return null
	}
}

const pad = (n: number) => String(n).padStart(2, '0')

function nowAsTimestamp(): string {
	const now = new Date()
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
}

export function listArchivedDiffs(): string[] {
	const archiveDir = join(balanceConfig.diffsDir, 'archive')
	try {
		return readdirSync(archiveDir)
			.filter(
				(file) => file.startsWith('diff_') && file.endsWith('.json')
			)
			.map((file) => join(archiveDir, file))
			.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
	} catch {
		return []
	}
}

export function saveDiffFile(changes: Changes): boolean {
	if (changes.length === 0) return false

	const data = JSON.stringify(changes, null, 2)
	const { diffsDir, maxArchiveDiffs } = balanceConfig

	mkdirSync(diffsDir, { recursive: true })
	writeFileSync(join(diffsDir, 'diff.json'), data, 'utf-8')

	const archiveDir = join(diffsDir, 'archive')
	mkdirSync(archiveDir, { recursive: true })
	writeFileSync(
		join(archiveDir, `diff_${nowAsTimestamp()}.json`),
		data,
		'utf-8'
	)

	for (const oldFile of listArchivedDiffs().slice(maxArchiveDiffs)) {
		try {
			unlinkSync(oldFile)
		} catch {
			// ignore removal failures
		}
	}

	return true
}

export function readDiffFile(): Changes | null {
	try {
		const content = readFileSync(
			join(balanceConfig.diffsDir, 'diff.json'),
			'utf-8'
		)
		return JSON.parse(content) as Changes
	} catch {
		return null
	}
}

export function readArchivedDiff(timestamp: string): Changes | null {
	try {
		const content = readFileSync(
			join(balanceConfig.diffsDir, 'archive', `diff_${timestamp}.json`),
			'utf-8'
		)
		return JSON.parse(content) as Changes
	} catch {
		return null
	}
}
