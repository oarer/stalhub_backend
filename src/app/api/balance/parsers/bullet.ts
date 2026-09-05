import { loadStatsRegistry } from '../registry'
import type { ItemData, StatChange } from '../types'
import {
	buildStatChange,
	formatValueStr,
	getItemName,
	getStatLabel,
} from './helpers'

export function parseBullet(
	data: ItemData,
	lang = 'ru'
): Record<string, unknown> {
	const infoBlocks = data.infoBlocks
	const registry = loadStatsRegistry('bullets')

	const parsedResult: Record<string, unknown> = {
		Название: getItemName(data, lang),
		Класс: 'Патроны',
		bulletFlags: [],
	}

	for (const block of infoBlocks ?? []) {
		if (!block || block.type !== 'list') continue

		for (const elem of block.elements ?? []) {
			if (elem.type === 'text') {
				const flagText = elem.text?.lines?.[lang]
				if (flagText) {
					;(parsedResult['bulletFlags'] as string[]).push(flagText)
				}
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

export function getBulletComparisonList(
	oldData: ItemData,
	newData: ItemData,
	lang = 'ru'
): StatChange[] {
	const oldStats = parseBullet(oldData, lang)
	const newStats = parseBullet(newData, lang)
	const lines: StatChange[] = []

	const excluded = new Set(['bulletFlags', 'Название', 'Класс'])
	const allKeys = [
		...new Set([...Object.keys(oldStats), ...Object.keys(newStats)]),
	]
		.filter((key) => !excluded.has(key))
		.sort()

	for (const key of allKeys) {
		const vOld = oldStats[key]
		const vNew = newStats[key]
		if (formatValueStr(vOld) !== formatValueStr(vNew)) {
			lines.push(
				buildStatChange(
					key,
					vOld as string | number | null | undefined,
					vNew as string | number | null | undefined
				)
			)
		}
	}

	const oldFlags = new Set((oldStats['bulletFlags'] as string[]) ?? [])
	const newFlags = new Set((newStats['bulletFlags'] as string[]) ?? [])

	if (
		oldFlags.size !== newFlags.size ||
		[...oldFlags].some((flag) => !newFlags.has(flag))
	) {
		const added = [...newFlags].filter((flag) => !oldFlags.has(flag)).sort()
		const removed = [...oldFlags]
			.filter((flag) => !newFlags.has(flag))
			.sort()

		if (added.length) {
			lines.push({
				label: 'Свойства',
				oldValue: null,
				newValue: added.join(', '),
				type: 'added',
			})
		}
		if (removed.length) {
			lines.push({
				label: 'Свойства',
				oldValue: removed.join(', '),
				newValue: null,
				type: 'removed',
			})
		}
	}

	return lines
}
