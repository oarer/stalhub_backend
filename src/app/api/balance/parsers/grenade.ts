import { loadStatsRegistry } from '../registry'
import type { ItemData, StatChange } from '../types'
import {
	buildStatChange,
	formatValueStr,
	getItemName,
	getStatLabel,
	getTextOrTextValue,
} from './helpers'

export function parseGrenade(
	data: ItemData,
	lang = 'ru'
): Record<string, unknown> {
	const infoBlocks = data.infoBlocks
	const registry = loadStatsRegistry('grenades')

	const parsedResult: Record<string, unknown> = {
		Название: getItemName(data, lang),
		Ранг: getTextOrTextValue(infoBlocks, 'core.tooltip.info.rank', lang),
		Класс: 'Гранаты',
	}

	for (const block of infoBlocks ?? []) {
		if (!block || block.type !== 'list') continue

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
				parsedResult[statName] = parsed as number
			}
		}
	}

	registry.saveIfUpdated()

	return parsedResult
}

export function getGrenadeComparisonList(
	oldData: ItemData,
	newData: ItemData,
	lang = 'ru'
): StatChange[] {
	const oldStats = parseGrenade(oldData, lang)
	const newStats = parseGrenade(newData, lang)
	const lines: StatChange[] = []

	const excluded = new Set(['Название', 'Класс'])
	const allKeys = [
		...new Set([...Object.keys(oldStats), ...Object.keys(newStats)]),
	]
		.filter((key) => !excluded.has(key))
		.sort()

	for (const key of allKeys) {
		const vOld = oldStats[key]
		const vNew = newStats[key]
		if (formatValueStr(vOld) !== formatValueStr(vNew)) {
			lines.push(buildStatChange(key, vOld, vNew))
		}
	}

	return lines
}
