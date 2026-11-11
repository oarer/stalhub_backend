import type {
	UnoGearAttachment,
	UnoGearAttribute,
	UnoGearItem,
	UnoItemLookup,
	UnoPlayerGear,
	UnoRawAttachment,
	UnoRawGearSlot,
	UnoRawPlayer,
} from '@/types/uno.type'

const SLOT_TYPES: Record<number, string> = {
	1: 'armor',
	2: 'skin',
	3: 'primary_weapon',
	4: 'secondary_weapon',
	5: 'backpack',
	6: 'melee',
}

const ATTACHMENT_LABELS: Record<string, string> = {
	slot_sight: 'sight',
	slot_muzzle: 'muzzle',
	slot_grip: 'grip',
	slot_butt: 'butt',
	slot_mount1: 'mount_1',
	slot_mount2: 'mount_2',
	slot_mount3: 'mount_3',
	slot_mount4: 'mount_4',
	slot_mount5: 'mount_5',
	slot_acc1: 'accessory_1',
	slot_acc2: 'accessory_2',
	slot_acc3: 'accessory_3',
	module: 'module',
	style: 'style',
}

const ATTACHMENT_ORDER = Object.keys(ATTACHMENT_LABELS)

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null
	const items = value.filter(
		(entry): entry is string => typeof entry === 'string'
	)
	return items.length > 0 ? items : null
}

function categoryFromDefinition(definition: string | null): string | null {
	if (!definition) return null

	const parts = definition.replace(/\\/g, '/').split('/').filter(Boolean)
	const itemsIndex = parts.findIndex((part) => part.toLowerCase() === 'items')

	return itemsIndex >= 0 ? (parts[itemsIndex + 1] ?? null) : null
}

function slotIndex(key: string): number {
	const match = /^slot_(\d+)$/.exec(key)
	return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function slotType(index: number): string {
	return SLOT_TYPES[index] ?? 'unknown'
}

function attachmentLabel(key: string): string {
	if (ATTACHMENT_LABELS[key]) return ATTACHMENT_LABELS[key]
	if (Number.isInteger(Number(key))) return `artifact_${Number(key) + 1}`
	return key
}

function attachmentRank(key: string): number {
	const known = ATTACHMENT_ORDER.indexOf(key)
	if (known >= 0) return known
	if (Number.isInteger(Number(key))) return 100 + Number(key)
	return 1000
}

function gearListingCategory(
	category: string | null,
	type: string
): string | null {
	if (category === 'armor' || type === 'armor') return 'armor'
	if (category === 'artefacts') return 'artefact'
	if (category === 'backpacks_new' || category === 'other') return 'bag'
	if (category === 'att' || category?.startsWith('modules'))
		return 'attachment'
	if (type === 'backpack') return 'bag'
	if (
		type === 'primary_weapon' ||
		type === 'secondary_weapon' ||
		type === 'melee'
	)
		return 'weapon'
	return null
}

function attachmentListingCategory(category: string | null): string | null {
	if (category === 'artefacts') return 'artefact'
	if (category === 'att' || category?.startsWith('modules'))
		return 'attachment'
	return null
}

function parseAttribute(value: unknown): UnoGearAttribute | null {
	const raw = asRecord(value)
	if (!raw) return null

	return {
		type: asNumber(raw.type),
		definitionId: asString(raw.definitionId),
		quality: asNumber(raw.quality),
		statsRandom: asNumber(raw.statsRandom),
	}
}

function parseAttachment(
	slot: string,
	raw: UnoRawAttachment,
	lookup?: UnoItemLookup
): UnoGearAttachment {
	const tag = asRecord(raw.tag) ?? asRecord(raw.tag_scalars) ?? {}
	const name = asString(raw.name)
	const definition = asString(raw.definition)
	const category = categoryFromDefinition(definition)
	const db = lookup?.(name, attachmentListingCategory(category)) ?? null

	const attributes = Array.isArray(tag.attributes)
		? tag.attributes
				.map(parseAttribute)
				.filter((entry): entry is UnoGearAttribute => entry !== null)
		: []

	return {
		slot,
		slotLabel: attachmentLabel(slot),
		id: asNumber(raw.id),
		itemId: db?.id ?? null,
		name,
		category,
		definition,
		db,
		quality: asNumber(tag.qlt) ?? asNumber(raw.quality),
		potential: asNumber(tag.ptn) ?? asNumber(raw.potential),
		ndmg: asNumber(tag.ndmg) ?? asNumber(raw.ndmg),
		upgradeBonus:
			asNumber(tag.upgrade_bonus) ?? asNumber(raw.upgrade_bonus),
		randomStats: asNumber(tag.stats_random) ?? asNumber(raw.random_stats),
		bonusProperties: asStringArray(
			tag.bonus_properties ?? raw.bonus_properties
		),
		inbuilt: tag.is_inbuilt === 1 || tag.default_attachment === 1,
		source: asNumber(tag.src) ?? asNumber(raw.src),
		attributes,
	}
}

function parseItem(
	slot: string,
	raw: UnoRawGearSlot,
	lookup?: UnoItemLookup
): UnoGearItem {
	const nbt = asRecord(raw.nbt) ?? {}
	const tag = asRecord(nbt.tag) ?? {}
	const metadata = asRecord(raw.attachments) ?? {}
	const rawAttachments = asRecord(tag.attach) ?? {}
	const attachmentKeys = new Set([
		...Object.keys(metadata),
		...Object.keys(rawAttachments),
	])

	const attachments = [...attachmentKeys]
		.map((key) => {
			const meta = asRecord(metadata[key]) as UnoRawAttachment | null
			const source = asRecord(
				rawAttachments[key]
			) as UnoRawAttachment | null
			if (!meta && !source) return null

			return parseAttachment(
				key,
				{
					...(source ?? {}),
					...(meta ?? {}),
				},
				lookup
			)
		})
		.filter((entry): entry is UnoGearAttachment => entry !== null)
		.sort((a, b) => attachmentRank(a.slot) - attachmentRank(b.slot))

	const index = slotIndex(slot)
	const type = slotType(index)
	const name = asString(raw.name)
	const definition = asString(raw.definition)
	const category = categoryFromDefinition(definition)
	const db = lookup?.(name, gearListingCategory(category, type)) ?? null
	const upgradeLevel = asNumber(tag.upgrade_level)

	return {
		slot,
		slotIndex: index,
		slotType: type,
		id: asNumber(nbt.id),
		itemId: db?.id ?? null,
		name,
		category,
		definition,
		db,
		owner: asString(tag.owner),
		upgradeLevel,
		upgrade: {
			level: upgradeLevel,
			failedAttempts: asNumber(tag.failed_upgrades),
			compensatedAttempts: asNumber(tag.compens_2024_upgrade_attempts),
		},
		quality: asNumber(tag.qlt),
		potential: asNumber(tag.ptn),
		upgradeBonus: asNumber(tag.upgrade_bonus),
		randomStats: asNumber(tag.stats_random),
		damage: asNumber(nbt.Damage),
		count: asNumber(nbt.Count_i),
		skin: asString(tag.material),
		attachments,
	}
}

export function parsePlayerGear(
	player: UnoRawPlayer,
	lookup?: UnoItemLookup
): UnoPlayerGear {
	const gear = asRecord(player.gear) ?? {}

	const items = Object.entries(gear)
		.map(([slot, value]) => {
			const raw = asRecord(value) as UnoRawGearSlot | null
			return raw ? parseItem(slot, raw, lookup) : null
		})
		.filter((entry): entry is UnoGearItem => entry !== null)
		.sort((a, b) => a.slotIndex - b.slotIndex)

	return {
		name: player.name ?? '',
		faction: asString(player.faction),
		clan: asString(player.clan),
		tag: asString(player.tag),
		clanRank: asNumber(player.clan_rank),
		strings: asStringArray(player.strings) ?? [],
		items,
	}
}
