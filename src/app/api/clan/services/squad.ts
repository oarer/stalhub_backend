import type { SquadMap } from 'generated/prisma/enums'
import { prisma } from '@/lib/prisma'

const MAX_SLOTS = 5

const memberInclude = () => ({
	member: {
		include: {
			user: { select: { id: true, username: true, name: true } },
		},
	},
})

const squadInclude = () => ({
	members: {
		include: memberInclude(),
		orderBy: { slot: 'asc' as const },
	},
	leader: { include: memberInclude() },
	requests: {
		include: memberInclude(),
		orderBy: { created_at: 'asc' as const },
	},
})

export class SquadService {
	async list(clanId: string) {
		return prisma.clanSquad.findMany({
			where: { clanId },
			include: squadInclude(),
			orderBy: [{ map: 'asc' }, { created_at: 'asc' }],
		})
	}

	async create(clanId: string, userId: number, name: string, map: SquadMap) {
		const count = await prisma.clanSquad.count({ where: { clanId, map } })
		if (count >= 6) {
			throw new Error(`Максимум 6 отрядов на карту`)
		}

		const existing = await prisma.clanSquad.findUnique({
			where: { clanId_map_name: { clanId, map, name } },
		})
		if (existing)
			throw new Error('Отряд с таким названием уже есть на этой карте')

		return prisma.clanSquad.create({
			data: { clanId, map, name, createdBy: userId },
			include: squadInclude(),
		})
	}

	async assignMember(squadId: number, clanMemberId: number, slot: number) {
		if (slot < 0 || slot >= MAX_SLOTS) {
			throw new Error(`Слот должен быть 0-${MAX_SLOTS - 1}`)
		}

		const squad = await prisma.clanSquad.findUnique({
			where: { id: squadId },
		})
		if (!squad) throw new Error('Отряд не найден')

		const member = await prisma.clanMember.findUnique({
			where: { id: clanMemberId },
		})
		if (!member || member.clanId !== squad.clanId) {
			throw new Error('Участник не из этого клана')
		}

		const existing = await prisma.clanSquadMember.findFirst({
			where: { memberId: clanMemberId },
		})
		if (existing?.squadId === squadId && existing.slot === slot) {
			return prisma.clanSquadMember.findUniqueOrThrow({
				where: { id: existing.id },
				include: memberInclude(),
			})
		}

		const occupied = await prisma.clanSquadMember.findUnique({
			where: { squadId_slot: { squadId, slot } },
		})

		return prisma.$transaction(async (tx) => {
			if (existing) {
				await tx.clanSquadMember.delete({ where: { id: existing.id } })
				await tx.clanSquad.updateMany({
					where: { id: existing.squadId, leaderId: existing.id },
					data: { leaderId: null },
				})
			}
			if (occupied) {
				await tx.clanSquadMember.delete({ where: { id: occupied.id } })
				await tx.clanSquad.updateMany({
					where: { id: squadId, leaderId: occupied.id },
					data: { leaderId: null },
				})
			}
			return tx.clanSquadMember.create({
				data: { squadId, memberId: clanMemberId, slot },
				include: memberInclude(),
			})
		})
	}

	async setLeader(squadId: number, memberId: number | null) {
		const squad = await prisma.clanSquad.findUnique({
			where: { id: squadId },
		})
		if (!squad) throw new Error('Отряд не найден')

		if (memberId !== null) {
			const squadMember = await prisma.clanSquadMember.findUnique({
				where: { id: memberId },
			})
			if (!squadMember || squadMember.squadId !== squadId) {
				throw new Error('Участник не в этом отряде')
			}
		}

		return prisma.clanSquad.update({
			where: { id: squadId },
			data: { leaderId: memberId },
			include: squadInclude(),
		})
	}

	async updateMap(squadId: number, clanId: string, map: SquadMap) {
		const squad = await prisma.clanSquad.findUnique({
			where: { id: squadId },
		})
		if (!squad) throw new Error('Отряд не найден')
		if (squad.clanId !== clanId) throw new Error('Отряд не из вашего клана')

		if (squad.map !== map) {
			const count = await prisma.clanSquad.count({
				where: { clanId, map, NOT: { id: squadId } },
			})
			if (count >= 6) {
				throw new Error(`Максимум 6 отрядов на карту`)
			}
			const existing = await prisma.clanSquad.findUnique({
				where: { clanId_map_name: { clanId, map, name: squad.name } },
			})
			if (existing)
				throw new Error(
					'Отряд с таким названием уже есть на этой карте'
				)
		}

		return prisma.clanSquad.update({
			where: { id: squadId },
			data: { map },
			include: squadInclude(),
		})
	}

	async removeMember(squadId: number, slot: number) {
		const slotRec = await prisma.clanSquadMember.findUnique({
			where: { squadId_slot: { squadId, slot } },
		})
		if (!slotRec) throw new Error('Слот пуст')

		await prisma.clanSquadMember.delete({ where: { id: slotRec.id } })
		await prisma.clanSquad.updateMany({
			where: { id: squadId, leaderId: slotRec.id },
			data: { leaderId: null },
		})
		return { success: true }
	}

	async requestJoin(squadId: number, userId: number) {
		const squad = await prisma.clanSquad.findUnique({
			where: { id: squadId },
		})
		if (!squad) throw new Error('Отряд не найден')

		const member = await prisma.clanMember.findFirst({
			where: { clanId: squad.clanId, userId },
		})
		if (!member) throw new Error('Вы не состоите в этом клане')

		const inSquad = await prisma.clanSquadMember.findFirst({
			where: { memberId: member.id },
		})
		if (inSquad && inSquad.squadId === squadId)
			throw new Error('Вы уже состоите в этом отряде')

		const full = await prisma.clanSquadMember.count({ where: { squadId } })
		if (full >= MAX_SLOTS) throw new Error('В отряде нет свободных мест')

		await prisma.clanSquadRequest.deleteMany({
			where: { memberId: member.id },
		})
		return prisma.clanSquadRequest.create({
			data: { squadId, memberId: member.id },
			include: {
				member: {
					include: {
						user: {
							select: { id: true, username: true, name: true },
						},
					},
				},
			},
		})
	}

	async approveRequest(requestId: number, clanId: string) {
		const req = await prisma.clanSquadRequest.findUnique({
			where: { id: requestId },
			include: { squad: true },
		})
		if (!req) throw new Error('Заявка не найдена')
		if (req.squad.clanId !== clanId)
			throw new Error('Заявка не из вашего клана')

		const inSquad = await prisma.clanSquadMember.findFirst({
			where: { memberId: req.memberId },
		})
		if (inSquad && inSquad.squadId === req.squadId) {
			await prisma.clanSquadRequest.delete({ where: { id: requestId } })
			throw new Error('Участник уже состоит в этом отряде')
		}
		if (inSquad) {
			await prisma.clanSquadMember.delete({ where: { id: inSquad.id } })
			await prisma.clanSquad.updateMany({
				where: { id: inSquad.squadId, leaderId: inSquad.id },
				data: { leaderId: null },
			})
		}

		const count = await prisma.clanSquadMember.count({
			where: { squadId: req.squadId },
		})
		if (count >= MAX_SLOTS) throw new Error('В отряде нет свободных мест')

		const taken = await prisma.clanSquadMember.findMany({
			where: { squadId: req.squadId },
			select: { slot: true },
		})
		const takenSet = new Set(taken.map((t) => t.slot))
		let slot = -1
		for (let i = 0; i < MAX_SLOTS; i++) {
			if (!takenSet.has(i)) {
				slot = i
				break
			}
		}

		const result = await prisma.clanSquadMember.create({
			data: { squadId: req.squadId, memberId: req.memberId, slot },
			include: memberInclude(),
		})
		await prisma.clanSquadRequest.delete({ where: { id: requestId } })
		return result
	}

	async rejectRequest(requestId: number, clanId: string) {
		const req = await prisma.clanSquadRequest.findUnique({
			where: { id: requestId },
			include: { squad: true },
		})
		if (!req) throw new Error('Заявка не найдена')
		if (req.squad.clanId !== clanId)
			throw new Error('Заявка не из вашего клана')

		await prisma.clanSquadRequest.delete({ where: { id: requestId } })
		return { success: true }
	}

	async delete(squadId: number, userId: number) {
		const squad = await prisma.clanSquad.findUnique({
			where: { id: squadId },
		})
		if (!squad) throw new Error('Отряд не найден')
		if (squad.createdBy !== userId) {
			const profile = await prisma.userClanProfile.findUnique({
				where: { userId },
			})
			const member = profile?.clanId
				? await prisma.clanMember.findFirst({
						where: { clanId: profile.clanId, userId },
					})
				: null
			if (!member || member.rank !== 'LEADER')
				throw new Error(
					'Удалять отряд может только лидер клана'
				)
		}

		await prisma.clanSquad.delete({ where: { id: squadId } })
		return { success: true }
	}
}

export const squadService = new SquadService()
