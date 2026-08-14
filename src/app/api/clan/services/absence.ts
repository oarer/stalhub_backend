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
	eventType: string
	stages?: number[] | null
}

export class AbsenceService {
	async listForDate(clanId: string, date: string) {
		return prisma.absence.findMany({
			where: { clanId, date },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: { updated_at: 'desc' },
		})
	}

	async listRange(clanId: string, from: string, to: string) {
		return prisma.absence.findMany({
			where: { clanId, date: { gte: from, lte: to } },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: { date: 'asc' },
		})
	}

	async upsert(
		userId: number,
		clanId: string,
		date: string,
		events: AbsenceEventInput[],
		note?: string | null
	) {
		this.validate(date, events)

		const normalized = events.map((e) => ({
			eventType: e.eventType,
			...(e.stages?.length
				? { stages: [...new Set(e.stages)].sort((a, b) => a - b) }
				: {}),
		}))

		return prisma.absence.upsert({
			where: { userId_date: { userId, date } },
			create: {
				clanId,
				userId,
				date,
				events: normalized as never,
				note: note ?? null,
			},
			update: { clanId, events: normalized as never, note: note ?? null },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
		})
	}

	async remove(userId: number, clanId: string, date: string) {
		const result = await prisma.absence.deleteMany({
			where: { userId, clanId, date },
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
				!ABSENCE_EVENT_TYPES.includes(e.eventType as AbsenceEventType)
			) {
				throw new Error(`Неизвестное событие: ${e.eventType}`)
			}
			const max = MAX_STAGES[e.eventType] ?? 0
			for (const s of e.stages ?? []) {
				if (s < 1 || s > max)
					throw new Error(`Неверный этап ${s} для ${e.eventType}`)
			}
		}
	}
}

export const absenceService = new AbsenceService()
