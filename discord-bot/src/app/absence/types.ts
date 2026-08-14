import type {
	AnySelectMenuInteraction,
	ButtonInteraction,
	ModalSubmitInteraction,
} from 'discord.js'

export const ABSENCE_PREFIX = 'abs:'

export const ABSENCE_EVENT_ORDER = [
	'TOURNAMENT',
	'BRAWL',
	'BASE_CAPTURE',
	'GOLD_DROP',
]

export const ABSENCE_EVENT_NAMES: Record<string, string> = {
	TOURNAMENT: 'Турнир',
	BRAWL: 'Потасовка',
	BASE_CAPTURE: 'Захват базы',
	GOLD_DROP: 'Голд дроп',
}

export const ABSENCE_MAX_STAGES: Record<string, number> = {
	TOURNAMENT: 3,
	BRAWL: 3,
	BASE_CAPTURE: 4,
	GOLD_DROP: 0,
}

export const ABSENCE_DEADLINE_MSK_HOUR = 19
export const ABSENCE_DATE_OPTIONS = 8

export const ABSENCE_ID = {
	date: `${ABSENCE_PREFIX}date`,
	event: `${ABSENCE_PREFIX}event`,
	stages: `${ABSENCE_PREFIX}stages`,
	note: `${ABSENCE_PREFIX}note`,
	save: `${ABSENCE_PREFIX}save`,
	cancel: `${ABSENCE_PREFIX}cancel`,
	noteInput: `${ABSENCE_PREFIX}note-input`,
	removeConfirm: `${ABSENCE_PREFIX}remove:confirm`,
	removeCancel: `${ABSENCE_PREFIX}remove:cancel`,
	open: (date: string) => `${ABSENCE_PREFIX}open:${date}`,
	remove: (date: string) => `${ABSENCE_PREFIX}remove:${date}`,
} as const

export interface AbsenceEntry {
	id: number
	date: string
	events: Array<{ eventType: string; stages?: number[] }>
	note: string | null
	user: { id: number; username: string; name: string }
}

export interface AbsenceDraft {
	mode: 'set' | 'remove'
	clanId: string
	clan: { name: string; tag: string }
	sourceChannelId: string
	sourceMessageId: string
	sourceDate: string
	date: string
	events: string[]
	stages: number[]
	note: string
}

export type AbsenceInteraction =
	| AnySelectMenuInteraction
	| ButtonInteraction
	| ModalSubmitInteraction
