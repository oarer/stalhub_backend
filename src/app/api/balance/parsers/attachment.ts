import { loadStatsRegistry } from '../registry'
import type { ItemData, StatChange } from '../types'
import {
	buildStatChange,
	formatValueStr,
	getItemName,
	getStatLabel,
	getTextOrTextValue,
} from './helpers'

export function parseAttachment(
	data: ItemData,
	lang = 'ru'
): Record<string, unknown> {
	const infoBlocks = data.infoBlocks
	const registry = loadStatsRegistry('attachments')

	const parsedResult: Record<string, unknown> = {
		Название: getItemName(data, lang),
		Ранг: getTextOrTextValue(infoBlocks, 'core.tooltip.info.rank', lang),
		Класс: getTextOrTextValue(
			infoBlocks,
			'core.tooltip.info.category',
			lang
		),
	}

	for (const block of infoBlocks ?? []) {
		if (!block) continue
		if (block.type !== 'list') continue

		for (const elem of block.elements ?? []) {
			if (
				elem.type === 'key-value' &&
				String(elem.key?.key ?? '')
					.toLowerCase()
					.includes('zoom')
			) {
				const statKey = elem.key?.key
				if (!statKey) continue
				if (!registry.get(statKey)) {
					registry.set(
						statKey,
						elem.key?.lines?.[lang] ?? 'Неизвестно'
					)
				}
				const statName = registry.get(statKey)
				if (!statName) continue
				parsedResult[statName] = (
					elem.value as { text?: string } | undefined
				)?.text
			} else if (
				elem.type === 'numeric' ||
				elem.type === 'numericVariants'
			) {
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
	}

	registry.saveIfUpdated()

	return parsedResult
}

export function getAttachmentComparisonList(
	oldData: ItemData,
	newData: ItemData,
	lang = 'ru'
): StatChange[] {
	const oldStats = parseAttachment(oldData, lang)
	const newStats = parseAttachment(newData, lang)
	const lines: StatChange[] = []

	const allKeys = [
		...new Set([...Object.keys(oldStats), ...Object.keys(newStats)]),
	]
		.filter((key) => key !== 'compatibilityList')
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
