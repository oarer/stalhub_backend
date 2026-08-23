export enum ArtQuality {
	ART_QUALITY_COMMON = 'ART_QUALITY_COMMON',
	ART_QUALITY_UNCOMMON = 'ART_QUALITY_UNCOMMON',
	ART_QUALITY_SPECIAL = 'ART_QUALITY_SPECIAL',
	ART_QUALITY_RARE = 'ART_QUALITY_RARE',
	ART_QUALITY_EXCLUSIVE = 'ART_QUALITY_EXCLUSIVE',
	ART_QUALITY_LEGENDARY = 'ART_QUALITY_LEGENDARY',
	ART_QUALITY_UNIQUE = 'ART_QUALITY_UNIQUE',
}


export type Art = {
	instanceId: string
	item_id: string
	percent: number
	potential: number
	selectedStats: (string | null)[]
	qualityClass: ArtQuality
}

export type Armor = {
	id: string
	level: number
}

export type Container = {
	id: string
	slots: (string | null)[]
}

export enum BoostCategory {
	LONG_TIME_MEDICINE = 'item.effects.effect_type.long_time_medicine',
	SHORT_TIME_MEDICINE = 'item.effects.effect_type.short_time_medicine',
	MOBILITY = 'item.effects.effect_type.mobility',
	ACCUMULATION = 'item.effects.effect_type.accumulation',
	HEALING = 'item.effects.effect_type.healing',
	PROTECTION = 'item.effects.effect_type.protection',
}

export type BuildData = {
	arts: Art[]
	boost: Record<BoostCategory, string | null>
	armor: Armor | null
	container?: Container | null
}
