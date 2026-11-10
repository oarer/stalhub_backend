export interface UnoRawAttachment {
	id?: number
	Damage?: number
	Count_i?: number
	tag?: Record<string, unknown>
	[field: string]: unknown
}

export interface UnoRawGearSlot {
	bytes?: number
	decoded_bytes?: number
	nbt?: {
		id?: number
		Count_i?: number
		Damage?: number
		tag?: Record<string, unknown>
		[field: string]: unknown
	}
	attachments?: Record<string, UnoRawAttachment>
	name?: string | null
	definition?: string | null
	[field: string]: unknown
}

export interface UnoRawPlayer {
	name?: string
	faction?: string | null
	clan?: string | null
	tag?: string | null
	clan_rank?: number | null
	gear?: Record<string, UnoRawGearSlot | null>
	[field: string]: unknown
}

export interface UnoItemDbInfo {
	id: string
	name: string | null
	category: string | null
	type: string
	color: string | null
	state: string | null
}

export type UnoItemLookup = (
	name: string | null,
	expectedCategory?: string | null
) => UnoItemDbInfo | null

export interface UnoGearUpgradeInfo {
	level: number | null
	failedAttempts: number | null
	compensatedAttempts: number | null
}

export interface UnoGearAttribute {
	type: number | null
	definitionId: string | null
	quality: number | null
	statsRandom: number | null
}

export interface UnoGearAttachment {
	slot: string
	slotLabel: string
	id: number | null
	itemId: string | null
	name: string | null
	category: string | null
	definition: string | null
	db: UnoItemDbInfo | null
	quality: number | null
	potential: number | null
	ndmg: number | null
	upgradeBonus: number | null
	randomStats: number | null
	bonusProperties: string[] | null
	inbuilt: boolean
	source: number | null
	attributes: UnoGearAttribute[]
}

export interface UnoGearItem {
	slot: string
	slotIndex: number
	slotType: string
	id: number | null
	itemId: string | null
	name: string | null
	category: string | null
	definition: string | null
	db: UnoItemDbInfo | null
	owner: string | null
	upgradeLevel: number | null
	upgrade: UnoGearUpgradeInfo
	quality: number | null
	potential: number | null
	upgradeBonus: number | null
	randomStats: number | null
	damage: number | null
	count: number | null
	skin: string | null
	attachments: UnoGearAttachment[]
}

export interface UnoPlayerGear {
	name: string
	faction: string | null
	clan: string | null
	tag: string | null
	clanRank: number | null
	items: UnoGearItem[]
}

export interface UnoGearAttachmentSummary {
	slot: string
	slotLabel: string
	itemId: string | null
	name: string | null
	db: UnoItemDbInfo | null
	gameId: number | null
	quality: number | null
	potential: number | null
	ndmg: number | null
	upgradeBonus: number | null
	randomStats: number | null
	bonusProperties: string[] | null
	attributes: UnoGearAttribute[]
}

export interface UnoGearItemSummary {
	slot: string
	slotType: string
	itemId: string | null
	name: string | null
	db: UnoItemDbInfo | null
	gameId: number | null
	upgrade: UnoGearUpgradeInfo
	quality: number | null
	potential: number | null
	upgradeBonus: number | null
	randomStats: number | null
	attachments: UnoGearAttachmentSummary[]
}

export interface UnoPlayerGearSummary {
	name: string
	items: UnoGearItemSummary[]
}

export interface UnoSeasonTierClan {
	id: string
	name: string
	tag: string | null
	faction: string | null
	rating: number | null
	position: number | null
	seasonPosition: number | null
	flag: boolean | null
	memberCount: number | null
}

export interface UnoSeasonSubtier {
	level: number
	label: string
	fromPosition: number | null
	toPosition: number | null
	ratingMax: number | null
	ratingMin: number | null
	clans: UnoSeasonTierClan[]
}

export interface UnoSeasonTier {
	rank: string
	count: number
	subtiers: UnoSeasonSubtier[]
}

export interface UnoSeasonTiersResponse {
	season: string
	total: number | null
	observedAt: string | null
	ratingRulesVersion: string | null
	tiers: UnoSeasonTier[]
}
