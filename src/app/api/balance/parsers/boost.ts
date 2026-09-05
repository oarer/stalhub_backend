import { loadStatsRegistry } from '../registry'
import type { ItemData, StatChange } from '../types'
import {
	buildStatChange,
	formatValue,
	getItemName,
	getStatLabel,
	getTextValue,
} from './helpers'

export function parseBoost(
	data: ItemData,
	lang = 'ru'
): Record<string, string | number | null> {
	const infoBlocks = data.infoBlocks
	const registry = loadStatsRegistry('boosts')

	const result: Record<string, string | number | null> = {
		Название: getItemName(data, lang) ?? null,
		Ранг: getTextValue(infoBlocks, 'core.tooltip.info.rank', lang) ?? null,
		Класс:
			getTextValue(infoBlocks, 'core.tooltip.info.category', lang) ??
			null,
	}

	for (const block of infoBlocks ?? []) {
		if (block.type !== 'list') continue
		for (const elem of block.elements ?? []) {
			if (elem.type !== 'numeric' && elem.type !== 'numericVariants')
				continue
			const rawKey = elem.name?.key
			if (!rawKey) continue

			if (!registry.get(rawKey)) {
				registry.set(rawKey, getStatLabel(elem, lang))
			}
			const statName = registry.get(rawKey)
			if (!statName) continue

			const value = elem.value as number | number[] | undefined
			const parsed =
				elem.type === 'numeric'
					? value
					: Array.isArray(value)
						? value[0]
						: undefined

			if (parsed !== undefined && parsed !== null) {
				result[statName] = parsed as number
			}
		}
	}

	registry.saveIfUpdated()

	return result
}

export function getBoostComparisonList(
	oldData: ItemData,
	newData: ItemData,
	lang = 'ru'
): StatChange[] {
	const lines: StatChange[] = []
	const oldStats = parseBoost(oldData, lang)
	const newStats = parseBoost(newData, lang)

	const allKeys = [
		...new Set([...Object.keys(oldStats), ...Object.keys(newStats)]),
	].sort()

	for (const key of allKeys) {
		const vOld = oldStats[key]
		const vNew = newStats[key]

		if (formatValue(vOld) !== formatValue(vNew)) {
			lines.push(buildStatChange(key, vOld, vNew))
		}
	}

	return lines
}
