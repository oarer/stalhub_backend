import type { GoldDropStatus } from 'generated/prisma/enums'
import { mskNow } from '@/lib/msk'
import { prisma } from '@/lib/prisma'

const DROP_TIMES_MSK = [10, 13, 16, 19, 22]
const RETENTION_DAYS = 30

const memberInclude = {
	member: {
		include: {
			user: { select: { id: true, username: true, name: true } },
		},
	},
} as const

const dropInclude = {
	attendees: {
		include: memberInclude,
		orderBy: { id: 'asc' },
	},
} as const

export class GoldService {
	async list(clanId: string) {
		return prisma.goldDrop.findMany({
			where: { clanId },
			include: dropInclude,
			orderBy: { date: 'desc' },
		})
	}

	async createSchedule(days = 1) {
		const now = mskNow()
		const year = now.getUTCFullYear()
		const month = now.getUTCMonth()
		const day = now.getUTCDate()
		const clans = await prisma.clan.findMany({
			where: { status: 'ACTIVE' },
		})

		const results = await Promise.allSettled(
			clans.map(async (clan) => {
				const created = []
				for (let offset = 0; offset < days; offset++) {
					for (const hour of DROP_TIMES_MSK) {
						const dropDate = new Date(
							Date.UTC(year, month, day + offset, hour - 3, 0, 0)
						)
						const exists = await prisma.goldDrop.findFirst({
							where: { clanId: clan.id, date: dropDate },
						})
						if (exists) continue
						created.push(
							await prisma.goldDrop.create({
								data: { clanId: clan.id, date: dropDate },
							})
						)
					}
				}
				return created
			})
		)
		return results.filter((r) => r.status === 'fulfilled').length
	}

	async cleanup() {
		const cutoff = new Date(
			Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
		)
		const result = await prisma.goldDrop.deleteMany({
			where: { date: { lt: cutoff } },
		})
		return { deleted: result.count }
	}

	async setAttendees(dropId: number, clanId: string, memberIds: number[]) {
		const drop = await prisma.goldDrop.findUnique({ where: { id: dropId } })
		if (!drop) throw new Error('Дроп не найден')
		if (drop.clanId !== clanId) throw new Error('Дроп не из вашего клана')

		const valid = await prisma.clanMember.count({
			where: { id: { in: memberIds }, clanId },
		})
		if (valid !== memberIds.length) throw new Error('Некорректный участник')

		await prisma.$transaction([
			prisma.goldDropAttendee.deleteMany({ where: { dropId } }),
			prisma.goldDropAttendee.createMany({
				data: memberIds.map((memberId) => ({ dropId, memberId })),
			}),
		])
		return prisma.goldDrop.findUnique({
			where: { id: dropId },
			include: dropInclude,
		})
	}

	async setStatus(dropId: number, clanId: string, status: GoldDropStatus) {
		const drop = await prisma.goldDrop.findUnique({ where: { id: dropId } })
		if (!drop) throw new Error('Дроп не найден')
		if (drop.clanId !== clanId) throw new Error('Дроп не из вашего клана')

		return prisma.goldDrop.update({
			where: { id: dropId },
			data: { status },
			include: dropInclude,
		})
	}
}

export const goldService = new GoldService()
