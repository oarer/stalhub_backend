export type Locale = 'ru' | 'en' | 'es' | 'fr' | 'ko'
export const LOCALE = ['ru', 'en', 'es', 'fr', 'ko'] as const

export enum Regions {
    RU = 'RU',
    EU = 'EU',
    NA = 'NA',
    SEA ='SEA',
    NEA = 'NEA'
}

export enum InfoColor {
	DEFAULT = 'DEFAULT',
	QUEST_ITEM = 'QUEST_ITEM',
	RANK_NEWBIE = 'RANK_NEWBIE',
	RANK_STALKER = 'RANK_STALKER',
	RANK_VETERAN = 'RANK_VETERAN',
	RANK_MASTER = 'RANK_MASTER',
	RANK_LEGEND = 'RANK_LEGEND',
	ART_QUALITY_COMMON = 'ART_QUALITY_COMMON',
	ART_QUALITY_UNCOMMON = 'ART_QUALITY_UNCOMMON',
	ART_QUALITY_SPECIAL = 'ART_QUALITY_SPECIAL',
	ART_QUALITY_RARE = 'ART_QUALITY_RARE',
	ART_QUALITY_EXCLUSIVE = 'ART_QUALITY_EXCLUSIVE',
	ART_QUALITY_LEGENDARY = 'ART_QUALITY_LEGENDARY',
	ART_QUALITY_UNIQUE = 'ART_QUALITY_UNIQUE',
}


export type ArtifactAdditional = {
    ndmg?: number
    qlt?: number
    it_transf_count?: number
    upgrade_bonus?: number
    spawn_time?: number
    ptn?: number
    bonus_properties?: string[]
    stats_random?: number
    md_k?: string | number
}

export interface Lot {
    itemId: string
    amount: number
    startPrice: number
    currentPrice?: number
    buyoutPrice: number
    startTime: Date
    endTime: Date
    additional?: ArtifactAdditional
}
export interface LotsResponse {
    total: number
    lots: Lot[]
}

export interface LotHistory {
    amount: number
    price: number
    time: Date
    additional?: ArtifactAdditional
}

export interface LotsHistoryResponse {
    total: number
    prices: LotHistory[]
}

export type MessageText = {
	type: 'text'
	text: string
}

export type MessageTranslation = {
	type: 'translation'
	key: string
	args: object
	lines: { [key: string]: string }
}

export type Message = MessageText | MessageTranslation