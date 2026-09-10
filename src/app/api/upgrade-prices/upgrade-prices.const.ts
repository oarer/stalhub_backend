export type UpgradeItemKey =
	| 'catalyst'
	| 'quantum_battery'
	| 'advanced_tools'
	| 'cheap_tools'
	| 'standard_tools'
	| 'advanced_parts'
	| 'standard_parts'
	| 'cheap_parts'

export interface UpgradeItemMeta {
	key: UpgradeItemKey
	itemId: string
	energy: number | null
}

export const UPGRADE_ITEMS: readonly UpgradeItemMeta[] = [
	{ key: 'catalyst', itemId: '96z7y', energy: null },
	{ key: 'quantum_battery', itemId: '3gqkg', energy: 4000 },
	{ key: 'advanced_tools', itemId: '4q7pl', energy: null },
	{ key: 'cheap_tools', itemId: 'wjlrd', energy: null },
	{ key: 'standard_tools', itemId: 'qjqw9', energy: null },
	{ key: 'advanced_parts', itemId: 'y3nmw', energy: null },
	{ key: 'standard_parts', itemId: 'l0og1', energy: null },
	{ key: 'cheap_parts', itemId: 'j0w96', energy: null },
]

export const UPGRADE_ITEM_BY_ID: Readonly<Record<string, UpgradeItemMeta>> =
	Object.fromEntries(UPGRADE_ITEMS.map((it) => [it.itemId, it]))
