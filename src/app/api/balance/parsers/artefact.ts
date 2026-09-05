import { loadStatsRegistry } from '../registry'
import type { ItemData, StatChange } from '../types'
import {
	buildStatChange,
	getItemName,
	getStatKey,
	getStatLabel,
	parseNumber,
} from './helpers'

interface ArtefactRange {
	min: number
	max: number
}

function getArtefactValueByKey(
	data: ItemData,
	targetKey: string
): string | number | undefined {
	for (const block of data.infoBlocks ?? []) {
		if (block.type !== 'list') continue
		for (const elem of block.elements ?? []) {
			if (elem.type !== 'key-value') continue
			if (elem.key?.key !== targetKey) continue
			const value = elem.value as
				| {
						args?: Record<string, unknown>
						lines?: Record<string, string>
				  }
				| undefined
			const args = value?.args
			if (args && 'cost' in args) {
				return parseNumber(args.cost) ?? undefined
			}
			return value?.lines?.['ru']
		}
	}
	return undefined
}

export function parseArtefact(
	data: ItemData,
	lang = 'ru'
): Record<string, unknown> {
	const infoBlocks = data.infoBlocks
	const registry = loadStatsRegistry('artefact')

	const result: Record<string, unknown> = {
		Название: getItemName(data, lang),
		Ранг: getArtefactValueByKey(data, 'core.tooltip.info.rank'),
		Класс: getArtefactValueByKey(data, 'core.tooltip.info.category'),
	}

	const currentStats: Record<string, ArtefactRange> = {}
	const excludedKeys = new Set([
		'core.tooltip.info.base_price',
		'core.tooltip.info.category',
		'core.tooltip.info.rank',
	])

	for (const block of infoBlocks ?? []) {
		if (block.type !== 'list' && block.type !== 'addStat') continue
		for (const elem of block.elements ?? []) {
			const rawKey = getStatKey(elem)
			if (!rawKey || excludedKeys.has(rawKey)) continue

			if (!registry.get(rawKey)) {
				registry.set(rawKey, getStatLabel(elem, lang))
			}

			const statLabel = registry.get(rawKey)
			if (!statLabel) continue

			let vMin: number | null = null
			let vMax: number | null = null

			if (elem.type === 'range') {
				vMin = parseNumber(elem.min)
				vMax = parseNumber(elem.max)
			} else if (elem.type === 'numeric') {
				vMin = vMax = parseNumber(elem.value)
			} else if (elem.type === 'numericVariants') {
				const rawValues = elem.value as unknown[] | undefined
				vMin = vMax =
					rawValues?.[0] !== undefined
						? parseNumber(rawValues[0])
						: null
			} else {
				continue
			}

			if (vMin === null || vMax === null) continue

			if (currentStats[statLabel]) {
				currentStats[statLabel].min += vMin
				currentStats[statLabel].max += vMax
			} else {
				currentStats[statLabel] = { min: vMin, max: vMax }
			}
		}
	}

	registry.saveIfUpdated()

	const cleanResult: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(result)) {
		if (value !== undefined && value !== null) cleanResult[key] = value
	}
	Object.assign(cleanResult, currentStats)
	return cleanResult
}

function formatArtefactValue(v: unknown): string | number {
	if (v === undefined || v === null) return 'н/д'
	if (typeof v === 'number') return Math.round(v * 10000) / 10000
	return v
}

function isRange(v: unknown): v is ArtefactRange {
	return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function statChangeForArtefact(
	key: string,
	vOld: unknown,
	vNew: unknown
): StatChange {
	if (key === 'Ранг' || key === 'Класс' || key === 'Название') {
		return buildStatChange(
			key,
			formatArtefactValue(vOld),
			formatArtefactValue(vNew)
		)
	}

	const oMinFmt = formatArtefactValue(isRange(vOld) ? vOld.min : vOld)
	const oMaxFmt = formatArtefactValue(isRange(vOld) ? vOld.max : vOld)
	const nMinFmt = formatArtefactValue(isRange(vNew) ? vNew.min : vNew)
	const nMaxFmt = formatArtefactValue(isRange(vNew) ? vNew.max : vNew)

	if (
		oMinFmt === nMinFmt &&
		oMaxFmt === nMaxFmt &&
		(!isRange(vOld) || vOld.min === vOld.max) &&
		(!isRange(vNew) || vNew.min === vNew.max)
	) {
		return {
			label: key,
			oldValue: oMinFmt,
			newValue: nMinFmt,
			type:
				oMinFmt === 'н/д'
					? 'added'
					: nMinFmt === 'н/д'
						? 'removed'
						: 'changed',
		}
	}

	const oldValue =
		formatArtefactValue(oMinFmt) === formatArtefactValue(oMaxFmt)
			? oMinFmt
			: `[${oMinFmt}; ${oMaxFmt}]`
	const newValue =
		formatArtefactValue(nMinFmt) === formatArtefactValue(nMaxFmt)
			? nMinFmt
			: `[${nMinFmt}; ${nMaxFmt}]`

	return buildStatChange(key, oldValue, newValue)
}

export function getArtefactComparisonList(
	oldData: ItemData,
	newData: ItemData
): StatChange[] {
	const lines: StatChange[] = []
	const oldStats = parseArtefact(oldData)
	const newStats = parseArtefact(newData)

	const allKeys = [
		...new Set([...Object.keys(oldStats), ...Object.keys(newStats)]),
	].sort()

	for (const key of allKeys) {
		const vOld = oldStats[key]
		const vNew = newStats[key]

		const oMinFmt = formatArtefactValue(isRange(vOld) ? vOld.min : vOld)
		const oMaxFmt = formatArtefactValue(isRange(vOld) ? vOld.max : vOld)
		const nMinFmt = formatArtefactValue(isRange(vNew) ? vNew.min : vNew)
		const nMaxFmt = formatArtefactValue(isRange(vNew) ? vNew.max : vNew)

		if (oMinFmt === nMinFmt && oMaxFmt === nMaxFmt) continue

		lines.push(statChangeForArtefact(key, vOld, vNew))
	}

	return lines
}
