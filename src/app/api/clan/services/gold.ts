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
	async list(clan_id: string) {
		return prisma.goldDrop.findMany({
			where: { clan_id },
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
							where: { clan_id: clan.id, date: dropDate },
						})
						if (exists) continue
						created.push(
							await prisma.goldDrop.create({
								data: { clan_id: clan.id, date: dropDate },
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

	async setAttendees(drop_id: number, clan_id: string, member_ids: number[]) {
		const drop = await prisma.goldDrop.findUnique({ where: { id: drop_id } })
		if (!drop) throw new Error('Дроп не найден')
		if (drop.clan_id !== clan_id) throw new Error('Дроп не из вашего клана')

		const valid = await prisma.clanMember.count({
			where: { id: { in: member_ids }, clan_id },
		})
		if (valid !== member_ids.length) throw new Error('Некорректный участник')

		await prisma.$transaction([
			prisma.goldDropAttendee.deleteMany({ where: { drop_id } }),
			prisma.goldDropAttendee.createMany({
				data: member_ids.map((member_id) => ({ drop_id, member_id })),
			}),
		])
		return prisma.goldDrop.findUnique({
			where: { id: drop_id },
			include: dropInclude,
		})
	}

	async setStatus(drop_id: number, clan_id: string, status: GoldDropStatus) {
		const drop = await prisma.goldDrop.findUnique({ where: { id: drop_id } })
		if (!drop) throw new Error('Дроп не найден')
		if (drop.clan_id !== clan_id) throw new Error('Дроп не из вашего клана')

		return prisma.goldDrop.update({
			where: { id: drop_id },
			data: { status },
			include: dropInclude,
		})
	}
}

export const goldService = new GoldService()
