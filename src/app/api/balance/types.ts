export interface NameRef {
	key?: string
	lines?: Record<string, string>
}

export interface ValueRef {
	text?: string
	lines?: Record<string, string>
	args?: Record<string, unknown>
	min?: unknown
	max?: unknown
	value?: unknown
}

export interface InfoBlockElement {
	type?: string
	key?: NameRef
	name?: NameRef
	value?: unknown
	text?: {
		key?: string
		lines?: Record<string, string>
		args?: Record<string, unknown>
	}
	min?: unknown
	max?: unknown
}

export interface InfoBlock {
	type?: string
	title?: NameRef
	elements?: InfoBlockElement[]
}

export interface ItemData {
	name?: NameRef
	infoBlocks?: InfoBlock[]
	[key: string]: unknown
}

export type ItemCategory =
	| 'weapon'
	| 'armor'
	| 'artefact'
	| 'attachment'
	| 'bag'
	| 'boost'
	| 'bullet'
	| 'grenade'

export interface StatChange {
	label: string
	oldValue: string | number | null
	newValue: string | number | null
	type: 'added' | 'removed' | 'changed'
}

export interface ItemChange {
	path: string
	category: ItemCategory
	name: string
	changes: StatChange[]
}

export type Changes = ItemChange[]
