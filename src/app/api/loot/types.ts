export type LocaleCode = 'ru' | 'en' | 'es' | 'fr' | 'ko'

export type ItemNames = Partial<Record<LocaleCode, string>>

export interface CatalogItem {
	stack?: CatalogStack
	weight: number
	pct: number
	names?: ItemNames
}

export interface CatalogStack {
	id: string | number
	stackSize: number
	tag?: Record<string, unknown>
	stackSizeVariance?: number
	qlt?: number
}

export type CatalogSlot = CatalogItem[]

export interface CatalogTablePayload {
	title?: ItemNames
	slots: CatalogSlot[]
}

export type Catalog = Record<string, CatalogTablePayload>

interface RawStack {
	id?: unknown
	stackSize?: unknown
	tag?: unknown
	stackSizeVariance?: unknown
	weight?: unknown
	[key: string]: unknown
}

interface RawEntry {
	stack?: RawStack | unknown
	weight?: unknown
}

export interface RawGroup {
	name?: unknown
	groupDropProbability?: unknown
	entryList?: RawEntry[]
	[key: string]: unknown
}

export interface NormalizedSlotItem {
	id: string | number | null
	stackSize: number
	tag: Record<string, unknown> | undefined
	stackSizeVariance: number | undefined
	weight: number
}

export function isRawSlotList(value: unknown): value is unknown[] {
	return Array.isArray(value)
}

export function normalizeSlotItem(entry: RawEntry): NormalizedSlotItem | null {
	if (typeof entry !== 'object' || entry === null) {
		return null
	}

	const w = entry.weight
	const stack = entry.stack

	if (typeof stack !== 'object' || stack === null) {
		const weight = typeof w === 'number' ? w : 0
		return {
			id: null,
			stackSize: 1,
			tag: undefined,
			stackSizeVariance: undefined,
			weight,
		}
	}

	const rawStack = stack as RawStack

	const weight =
		typeof w === 'number'
			? w
			: typeof rawStack.weight === 'number'
				? rawStack.weight
				: 0

	const id = rawStack.id as string | number | null
	if (id === undefined || id === null) {
		return {
			id: null,
			stackSize: 1,
			tag: undefined,
			stackSizeVariance: undefined,
			weight,
		}
	}

	const tag =
		typeof rawStack.tag === 'object' && rawStack.tag !== null
			? (rawStack.tag as Record<string, unknown>)
			: undefined

	const stackSize =
		typeof rawStack.stackSize === 'number' ? rawStack.stackSize : 1
	const stackSizeVariance =
		typeof rawStack.stackSizeVariance === 'number'
			? rawStack.stackSizeVariance
			: undefined

	return { id, stackSize, tag, stackSizeVariance, weight }
}

export function normalizeSlot(slot: unknown[]): NormalizedSlotItem[] {
	const items: NormalizedSlotItem[] = []
	for (const entry of slot) {
		if (typeof entry !== 'object' || entry === null) {
			continue
		}
		const item = normalizeSlotItem(entry as RawEntry)
		if (item !== null) {
			items.push(item)
		}
	}
	return items
}

export function normalizeGroupSlot(rawGroup: RawGroup): NormalizedSlotItem[] {
	if (!Array.isArray(rawGroup.entryList)) {
		return []
	}
	return normalizeSlot(rawGroup.entryList)
}

export function extractQlt(
	tag: Record<string, unknown> | undefined
): number | undefined {
	if (!tag) {
		return undefined
	}

	const qlt = tag.qlt
	if (typeof qlt === 'number') {
		return qlt
	}
	if (typeof qlt === 'object' && qlt !== null) {
		const value = (qlt as Record<string, unknown>).value
		if (typeof value === 'number') {
			return value
		}
	}
	return undefined
}

export function toCatalogStack(item: NormalizedSlotItem): CatalogStack {
	const stack: CatalogStack = {
		id: item.id as string | number,
		stackSize: item.stackSize,
	}
	if (item.tag !== undefined) {
		const qlt = extractQlt(item.tag)
		if (qlt !== undefined) {
			stack.qlt = qlt
		}
		stack.tag = item.tag
	}
	if (item.stackSizeVariance !== undefined) {
		stack.stackSizeVariance = item.stackSizeVariance
	}
	return stack
}

export function catalogItemFromNormalized(
	item: NormalizedSlotItem,
	names?: ItemNames
): CatalogItem {
	const result: CatalogItem = {
		weight: item.weight,
		pct: 0,
	}
	if (item.id !== null) {
		result.stack = toCatalogStack(item)
	}
	if (names !== undefined) {
		result.names = names
	}
	return result
}
