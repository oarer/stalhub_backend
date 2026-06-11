import type { Message } from './api.type'

export interface Root {
	perks: Perk[]
	recipes: Recipe[]
}

export interface Perk {
	id: string
	name: Name
	desc: Desc
}

export interface Name {
	type: string
	key: string
	lines: Message
}

export interface Desc {
	type: string
	key: string
	lines: Message
}

export interface Recipe {
	bench: string
	category: Category
	subcategory: Subcategory
	result: EnrichedResult[]
	ingredients: EnrichedIngredient[]
	energy: number
	requirements: Requirements
}

export interface Category {
	type: string
	key: string
	lines: Message
}

export interface Subcategory {
	type: string
	key: string
	lines: Message
}

export interface Result {
	item: string
	amount: number
}

export interface Ingredient {
	item: string
	amount: number
}

export interface EnrichedResult extends Result {
	price: number | null
}

export interface EnrichedIngredient extends Ingredient {
	price: number | null
}

export interface Requirements {
	perks: Perks
	features: string[]
}

export interface Perks {
	ammunition?: number
	armorer?: number
	pyrotechnics?: number
	engineering?: number
	materials?: number
	medicine?: number
	cooking?: number
	brewing?: number
}
