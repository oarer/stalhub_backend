import { isBeforeMskHour, mskDate } from '@/lib/msk'
import { prisma } from '@/lib/prisma'

export const ABSENCE_EVENT_TYPES = [
	'TOURNAMENT',
	'BRAWL',
	'BASE_CAPTURE',
	'GOLD_DROP',
] as const
export type AbsenceEventType = (typeof ABSENCE_EVENT_TYPES)[number]

const MAX_STAGES: Record<string, number> = {
	TOURNAMENT: 3,
	BRAWL: 3,
	BASE_CAPTURE: 4,
	GOLD_DROP: 0,
}

const DEADLINE_MSK_HOUR = 19

export interface AbsenceEventInput {
	event_type: string
	stages?: number[] | null
}

export class AbsenceService {
	async listForDate(clan_id: string, date: string) {
		return prisma.absence.findMany({
			where: { clan_id, date },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: { updated_at: 'desc' },
		})
	}

	async listRange(clan_id: string, from: string, to: string) {
		return prisma.absence.findMany({
			where: { clan_id, date: { gte: from, lte: to } },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: { date: 'asc' },
		})
	}

	async upsert(
		user_id: number,
		clan_id: string,
		date: string,
		events: AbsenceEventInput[],
		note?: string | null
	) {
		this.validate(date, events)

		const normalized = events.map((e) => ({
			event_type: e.event_type,
			...(e.stages?.length
				? { stages: [...new Set(e.stages)].sort((a, b) => a - b) }
				: {}),
		}))

		return prisma.absence.upsert({
			where: { user_id_date: { user_id, date } },
			create: {
				clan_id,
				user_id,
				date,
				events: normalized as never,
				note: note ?? null,
			},
			update: { clan_id, events: normalized as never, note: note ?? null },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
		})
	}

	async remove(user_id: number, clan_id: string, date: string) {
		const result = await prisma.absence.deleteMany({
			where: { user_id, clan_id, date },
		})
		if (result.count === 0) throw new Error('Отписка не найдена')
		return { success: true }
	}

	private validate(date: string, events: AbsenceEventInput[]) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Неверная дата')
		if (!events.length) throw new Error('Выберите хотя бы одно событие')

		const today = mskDate()
		if (date < today) throw new Error('Нельзя оставить отписку в прошлом')
		if (date === today && !isBeforeMskHour(DEADLINE_MSK_HOUR)) {
			throw new Error(
				`Отписку на сегодня можно оставить только до ${String(DEADLINE_MSK_HOUR).padStart(2, '0')}:00 МСК`
			)
		}

		for (const e of events) {
			if (
				!ABSENCE_EVENT_TYPES.includes(e.event_type as AbsenceEventType)
			) {
				throw new Error(`Неизвестное событие: ${e.event_type}`)
			}
			const max = MAX_STAGES[e.event_type] ?? 0
			for (const s of e.stages ?? []) {
				if (s < 1 || s > max)
					throw new Error(`Неверный этап ${s} для ${e.event_type}`)
			}
		}
	}
}

export const absenceService = new AbsenceService()
