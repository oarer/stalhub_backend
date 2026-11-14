import type { UserbotSource, UserbotSourceName } from './userbot-config'

type TelegramEntity = {
	offset: number
	length: number
	url?: string
	className?: string
}

function entityName(entity: TelegramEntity): string {
	return entity.className ?? entity.constructor.name
}

function normalizedChannelKeys(value: unknown): string[] {
	if (value === undefined || value === null) return []
	const raw = String(value).trim().replace(/^@/, '').toLowerCase()
	if (!raw) return []
	const keys = [raw]
	if (/^-?\d+$/.test(raw)) {
		const unsigned = raw.replace(/^-/, '')
		keys.push(unsigned)
		if (unsigned.startsWith('100')) keys.push(unsigned.slice(3))
	}
	return [...new Set(keys)]
}

function findSourceMapping(
	channels: readonly unknown[],
	sources: readonly UserbotSource[]
): SourceMapping | null {
	const candidates = new Set(channels.flatMap(normalizedChannelKeys))
	for (const source of sources) {
		for (const channel of source.channels) {
			if (
				normalizedChannelKeys(channel).some((candidate) =>
					candidates.has(candidate)
				)
			) {
				return { source: source.source, channel }
			}
		}
	}
	return null
}

export function mapSourceForChannels(
	channels: readonly unknown[],
	sources: readonly UserbotSource[]
): UserbotSource | null {
	const mapping = findSourceMapping(channels, sources)
	if (!mapping) return null
	return sources.find((source) => source.source === mapping.source) ?? null
}

function entityMarker(entity: TelegramEntity): {
	open: string
	close: string
} | null {
	switch (entityName(entity)) {
		case 'MessageEntityBold':
			return { open: '**', close: '**' }
		case 'MessageEntityItalic':
		case 'MessageEntityUnderline':
			return { open: '__', close: '__' }
		case 'MessageEntityStrike':
			return { open: '~~', close: '~~' }
		case 'MessageEntityCode':
		case 'MessageEntityPre':
			return { open: '`', close: '`' }
		case 'MessageEntityTextUrl':
			return entity.url ? { open: '[', close: `](${entity.url})` } : null
		case 'MessageEntityUrl':
			return { open: '[', close: `](${entity.url ?? ''})` }
		default:
			return null
	}
}

export function telegramEntitiesToMarkdown(
	text: string,
	entities: readonly TelegramEntity[] = []
): string {
	const valid = entities
		.map((entity) => ({
			entity,
			start: Math.max(0, entity.offset),
			end: Math.min(text.length, entity.offset + entity.length),
			marker: entityMarker(entity),
		}))
		.filter((entry) => entry.marker && entry.start < entry.end)
		.sort(
			(a, b) =>
				a.start - b.start ||
				b.end - a.end ||
				b.entity.length - a.entity.length
		)

	const starts = new Map<number, typeof valid>()
	const ends = new Map<number, typeof valid>()
	for (const entry of valid) {
		const atStart = starts.get(entry.start) ?? []
		atStart.push(entry)
		starts.set(entry.start, atStart)
		const atEnd = ends.get(entry.end) ?? []
		atEnd.push(entry)
		ends.set(entry.end, atEnd)
	}

	const boundaries = new Set<number>([0, text.length])
	for (const entry of valid) {
		boundaries.add(entry.start)
		boundaries.add(entry.end)
	}
	const sortedBoundaries = [...boundaries].sort((a, b) => a - b)
	let output = ''
	for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
		const position = sortedBoundaries[index]!
		const closing = [...(ends.get(position) ?? [])].sort(
			(a, b) => a.start - b.start || a.end - b.end
		)
		for (const entry of closing.reverse()) output += entry.marker!.close
		for (const entry of starts.get(position) ?? [])
			output += entry.marker!.open
		const next = sortedBoundaries[index + 1]!
		output += text.slice(position, next)
	}
	const finalClosing = [...(ends.get(text.length) ?? [])].sort(
		(a, b) => a.start - b.start || a.end - b.end
	)
	for (const entry of finalClosing.reverse()) output += entry.marker!.close
	return output
}

export type SourceMapping = {
	source: UserbotSourceName
	channel: string
}

export function sourceMapping(
	channels: readonly unknown[],
	sources: readonly UserbotSource[]
): SourceMapping | null {
	return findSourceMapping(channels, sources)
}
