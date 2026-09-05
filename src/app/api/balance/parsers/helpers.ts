import type {
	InfoBlock,
	InfoBlockElement,
	ItemData,
	StatChange,
} from '../types'

export function buildStatChange(
	label: string,
	oldValue: string | number | null | undefined,
	newValue: string | number | null | undefined
): StatChange {
	const isEmpty = (value: string | number | null | undefined) =>
		value === null || value === undefined || value === ''

	const type: StatChange['type'] = isEmpty(oldValue)
		? 'added'
		: isEmpty(newValue)
			? 'removed'
			: 'changed'

	return {
		label,
		oldValue: oldValue ?? null,
		newValue: newValue ?? null,
		type,
	}
}

export function getTextValue(
	infoBlocks: InfoBlock[] | undefined,
	key: string,
	lang = 'ru'
): string | undefined {
	if (!infoBlocks) return undefined
	for (const block of infoBlocks) {
		if (block.type !== 'list') continue
		for (const elem of block.elements ?? []) {
			if (elem.type === 'key-value' && elem.key?.key === key) {
				return elemValueLines(elem, lang)
			}
		}
	}
	return undefined
}

export function getTextOrTextValue(
	infoBlocks: InfoBlock[] | undefined,
	key: string,
	lang = 'ru'
): string | undefined {
	if (!infoBlocks) return undefined
	for (const block of infoBlocks) {
		if (block.type !== 'list') continue
		for (const elem of block.elements ?? []) {
			if (elem.type === 'key-value' && elem.key?.key === key) {
				const value = elem.value as
					| { text?: string; lines?: Record<string, string> }
					| undefined
				return value?.text || value?.lines?.[lang]
			}
		}
	}
	return undefined
}

function elemValueLines(
	elem: InfoBlockElement,
	lang: string
): string | undefined {
	const value = elem.value as { lines?: Record<string, string> } | undefined
	return value?.lines?.[lang]
}

export function getNumericValue(
	infoBlocks: InfoBlock[] | undefined,
	key: string
): number | undefined {
	if (!infoBlocks) return undefined
	for (const block of infoBlocks) {
		if (block.type !== 'list') continue
		for (const elem of block.elements ?? []) {
			if (elem.type !== 'numeric' && elem.type !== 'numericVariants')
				continue
			if (elem.name?.key !== key) continue
			const value = elem.value as number | number[] | undefined
			if (elem.type === 'numeric') return value as number
			return Array.isArray(value) ? value[0] : undefined
		}
	}
	return undefined
}

export function getTextParamValue(
	infoBlocks: InfoBlock[] | undefined,
	keyPattern: string
): number | undefined {
	if (!infoBlocks) return undefined
	for (const block of infoBlocks) {
		if (block.type !== 'list') continue
		for (const elem of block.elements ?? []) {
			if (elem.type !== 'text') continue
			const text = elem.text
			if (!String(text?.key ?? '').includes(keyPattern)) continue
			const args = (text?.args ?? {}) as Record<string, unknown>
			if (args.modifier !== undefined) return Number(args.modifier)
			if (args.value !== undefined) return Number(args.value)
		}
	}
	return undefined
}

export function getStatKey(elem: InfoBlockElement): string | undefined {
	return elem.name?.key ?? elem.key?.key
}

export function getStatLabel(elem: InfoBlockElement, lang = 'ru'): string {
	return elem.name?.lines?.[lang] ?? 'Неизвестно'
}

export function getItemName(data: ItemData, lang = 'ru'): string | undefined {
	return data.name?.lines?.[lang]
}

export function formatValue(value: unknown): string | number {
	if (typeof value === 'number') {
		if (value === Math.trunc(value)) return value
		return Math.round(value * 100) / 100
	}
	return value ?? 'н/д'
}

export function formatValueStr(value: unknown): string {
	if (typeof value === 'number') {
		if (value === Math.trunc(value)) return String(value)
		return String(Math.round(value * 100) / 100)
	}
	return value === undefined || value === null ? 'н/д' : String(value)
}

export function parseNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null
	if (typeof value !== 'string') return null
	const normalized = value.replace(/\u00a0/g, ' ').replace(/,/g, '.')
	const match = normalized.match(/[-+]?\d*\.?\d+/)
	if (!match) return null
	const parsed = Number.parseFloat(match[0])
	return Number.isNaN(parsed) ? null : parsed
}
