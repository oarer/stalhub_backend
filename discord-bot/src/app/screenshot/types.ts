import type { ButtonInteraction } from 'discord.js'

export const SS_PREFIX = 'ss:'
export const SS_DAY_PREFIX = `${SS_PREFIX}day:`
export const SS_STAGE_PREFIX = `${SS_PREFIX}stage:`
export const SS_TYPE_PREFIX = `${SS_PREFIX}type:`

export const SS_TYPES: Array<{ value: string; label: string }> = [
	{ value: 'TOURNAMENT', label: 'Турнир' },
	{ value: 'BRAWL', label: 'Потасовка' },
	{ value: 'BASE_CAPTURE', label: 'Захват базы' },
]

export const SS_STAGE_MAX = 4
export const SS_DAY_OPTIONS = 4

export const SS_ID = {
	cancel: `${SS_PREFIX}cancel`,
	back: `${SS_PREFIX}back`,
	day: (date: string) => `${SS_DAY_PREFIX}${date}`,
	stage: (stage: number) => `${SS_STAGE_PREFIX}${stage}`,
	type: (type: string) => `${SS_TYPE_PREFIX}${type}`,
} as const

export interface ScreenshotFile {
	name: string
	type: string
	buffer: Buffer
}

export interface ScreenshotDraft {
	clanId: string
	file: ScreenshotFile
	date: string | null
	stage: number | null
	type: string | null
}

export type ScreenshotInteraction = ButtonInteraction