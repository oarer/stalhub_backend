import type { Message, MessageTranslation } from './api.type'

export type BarterRequiredItem = {
	item: string
	amount: number
}

export type BarterOffer = {
	currency: string
	cost: number
	requiredItems: BarterRequiredItem[]
}

export type BarterRecipe = {
	settlementRequiredLevel: number
	item: string
	offers: BarterOffer[]
}

export type SettlementTitle = {
	type: string
	key: string
	args: Record<string, never>
	lines: MessageTranslation['lines']
}

export type BarterEntry = {
	settlementTitle: SettlementTitle
	recipes: BarterRecipe[]
}

export type BarterCacheData = BarterEntry[]

export type ListingItem = {
	data: string
	icon: string
	name: Message
	color: string
}

export type BarterItemResult = {
	amount: number
	lines: Message
	icon: string
}

export type BarterRecipeResult = {
	money: string
	items: BarterItemResult[]
}
