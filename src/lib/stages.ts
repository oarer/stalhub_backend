import { StageType } from 'generated/prisma/enums'
import { MSK_OFFSET_MS } from './msk'

export type StageWindow = {
	stage: number
	start: [number, number]
	end: [number, number]
}

export type StageSchedule = Record<
	StageType,
	{ days: number[]; stages: StageWindow[] }
>

export const STAGE_SCHEDULE: StageSchedule = {
	TOURNAMENT: {
		days: [4, 5, 6],
		stages: [
			{ stage: 1, start: [20, 0], end: [20, 25] },
			{ stage: 2, start: [20, 25], end: [20, 50] },
			{ stage: 3, start: [20, 50], end: [21, 15] },
		],
	},
	BRAWL: {
		days: [1, 2, 3, 0],
		stages: [
			{ stage: 1, start: [20, 0], end: [20, 25] },
			{ stage: 2, start: [20, 25], end: [20, 50] },
			{ stage: 3, start: [20, 50], end: [21, 15] },
		],
	},
	BASE_CAPTURE: {
		days: [0],
		stages: [
			{ stage: 1, start: [19, 0], end: [19, 25] },
			{ stage: 2, start: [19, 25], end: [19, 50] },
			{ stage: 3, start: [19, 50], end: [20, 15] },
			{ stage: 4, start: [20, 15], end: [20, 40] },
		],
	},
}

const DETECT_ORDER: StageType[] = [
	StageType.TOURNAMENT,
	StageType.BRAWL,
	StageType.BASE_CAPTURE,
]

export function mskParts(now: Date = new Date()) {
	const msk = new Date(now.getTime() + MSK_OFFSET_MS)
	return {
		day: msk.getUTCDay(),
		minutes: msk.getUTCHours() * 60 + msk.getUTCMinutes(),
	}
}

function minutes(t: [number, number]) {
	return t[0] * 60 + t[1]
}

export function detectStageSlot(now: Date = new Date()): {
	type: StageType
	stage: number
} | null {
	const { day, minutes: m } = mskParts(now)
	for (const type of DETECT_ORDER) {
		const conf = STAGE_SCHEDULE[type]
		if (!conf.days.includes(day)) continue
		for (const w of conf.stages) {
			const start = minutes(w.start)
			const end = minutes(w.end)
			if (m >= start && m < end) return { type, stage: w.stage }
		}
	}
	return null
}

export function nextStageSlot(now: Date = new Date()): {
	type: StageType
	stage: number
	start_at: Date
} | null {
	const { day, minutes: m } = mskParts(now)
	let best: { type: StageType; stage: number; diff: number } | null = null
	for (const type of DETECT_ORDER) {
		const conf = STAGE_SCHEDULE[type]
		for (let offset = 0; offset < 7; offset++) {
			const targetDay = (day + offset) % 7
			if (!conf.days.includes(targetDay)) continue
			for (const w of conf.stages) {
				const start = minutes(w.start)
				const diff = start - m + offset * 24 * 60
				if (diff <= 0) continue
				if (!best || diff < best.diff) {
					best = { type, stage: w.stage, diff }
				}
			}
		}
	}
	if (!best) return null
	return {
		type: best.type,
		stage: best.stage,
		start_at: new Date(now.getTime() + best.diff * 60 * 1000),
	}
}
