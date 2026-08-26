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
	private async notify(
		userIds: number[],
		title: string,
		content: string,
		link: string,
		authorUsername?: string
	) {
		if (userIds.length === 0) return
		const uniqueIds = [...new Set(userIds)]
		await prisma.notifications.create({
			data: {
				title,
				content,
				author: authorUsername ?? 'Система',
				type: 0,
				link,
				users: { connect: uniqueIds.map((id) => ({ id })) },
			},
		})
	}

	async list(clan_id: string) {
		return prisma.clanSquad.findMany({
			where: { clan_id },
			include: squadInclude(),
			orderBy: [{ map: 'asc' }, { created_at: 'asc' }],
		})
	}

	async create(clan_id: string, user_id: number, name: string, map: SquadMap) {
		const count = await prisma.clanSquad.count({ where: { clan_id, map } })
		if (count >= 6) {
			throw new Error(`Максимум 6 отрядов на карту`)
		}

		const existing = await prisma.clanSquad.findUnique({
			where: { clan_id_map_name: { clan_id, map, name } },
		})
		if (existing)
			throw new Error('Отряд с таким названием уже есть на этой карте')

		return prisma.clanSquad.create({
			data: { clan_id, map, name, created_by: user_id },
			include: squadInclude(),
		})
	}

	async assignMember(squad_id: number, clanMemberId: number, slot: number, actorUserId?: number) {
		if (slot < 0 || slot >= MAX_SLOTS) {
			throw new Error(`Слот должен быть 0-${MAX_SLOTS - 1}`)
		}

		const squad = await prisma.clanSquad.findUnique({
			where: { id: squad_id },
		})
		if (!squad) throw new Error('Отряд не найден')

		const member = await prisma.clanMember.findUnique({
			where: { id: clanMemberId },
		})
		if (!member || member.clan_id !== squad.clan_id) {
			throw new Error('Участник не из этого клана')
		}

		const memberships = await prisma.clanSquadMember.findMany({
			where: { member_id: clanMemberId },
			include: { squad: true },
		})
		const current = memberships.find(
			(m) => m.squad_id === squad_id && m.slot === slot
		)
		if (current) {
			return prisma.clanSquadMember.findUniqueOrThrow({
				where: { id: current.id },
				include: memberInclude(),
			})
		}

		const occupied = await prisma.clanSquadMember.findUnique({
			where: { squad_id_slot: { squad_id, slot } },
		})

		const ownRow = memberships.find((m) => m.squad_id === squad_id)
		if (ownRow && !occupied) {
			return prisma.clanSquadMember.update({
				where: { id: ownRow.id },
				data: { slot },
				include: memberInclude(),
			})
		}
		if (ownRow && occupied) {
			return prisma.$transaction(async (tx) => {
				await tx.clanSquadMember.update({
					where: { id: occupied.id },
					data: { slot: -1 },
				})
				await tx.clanSquadMember.update({
					where: { id: ownRow.id },
					data: { slot },
				})
				return tx.clanSquadMember.update({
					where: { id: occupied.id },
					data: { slot: ownRow.slot },
					include: memberInclude(),
				})
			})
		}

		return prisma.$transaction(async (tx) => {
			const toDelete = new Map<number, number>()
			const movedFromSquadNames: string[] = []
			for (const m of memberships) {
				if (m.squad.map === squad.map) {
					toDelete.set(m.id, m.squad_id)
					if (m.squad_id !== squad_id) {
						movedFromSquadNames.push(m.squad.name)
					}
				}
			}
			if (occupied) toDelete.set(occupied.id, occupied.squad_id)
			for (const [id, squadRowId] of toDelete) {
				await tx.clanSquadMember.delete({ where: { id } })
				await tx.clanSquad.updateMany({
					where: { id: squadRowId, leader_id: id },
					data: { leader_id: null },
				})
			}
			const result = await tx.clanSquadMember.create({
				data: { squad_id, member_id: clanMemberId, slot },
				include: memberInclude(),
			})

			if (member.user_id && movedFromSquadNames.length > 0 && actorUserId && member.user_id !== actorUserId) {
				const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { username: true } })
				const targetSquad = await prisma.clanSquad.findUnique({ where: { id: squad_id }, select: { name: true } })
				await this.notify(
					[member.user_id],
					'Перемещение в отряд',
					`${actor?.username ?? 'Офицер'} переместил вас из отряда «${movedFromSquadNames[0]}» в «${targetSquad?.name ?? ''}»`,
					'/me/clan/squads',
					actor?.username
				)
			}

			return result
		})
	}

	async setLeader(squad_id: number, member_id: number | null) {
		const squad = await prisma.clanSquad.findUnique({
			where: { id: squad_id },
		})
		if (!squad) throw new Error('Отряд не найден')

		if (member_id !== null) {
			const squadMember = await prisma.clanSquadMember.findUnique({
				where: { id: member_id },
			})
			if (!squadMember || squadMember.squad_id !== squad_id) {
				throw new Error('Участник не в этом отряде')
			}
		}

		return prisma.clanSquad.update({
			where: { id: squad_id },
			data: { leader_id: member_id },
			include: squadInclude(),
		})
	}

	async updateMap(squad_id: number, clan_id: string, map: SquadMap) {
		const squad = await prisma.clanSquad.findUnique({
			where: { id: squad_id },
		})
		if (!squad) throw new Error('Отряд не найден')
		if (squad.clan_id !== clan_id) throw new Error('Отряд не из вашего клана')

		if (squad.map !== map) {
			const count = await prisma.clanSquad.count({
				where: { clan_id, map, NOT: { id: squad_id } },
			})
			if (count >= 6) {
				throw new Error(`Максимум 6 отрядов на карту`)
			}
			const existing = await prisma.clanSquad.findUnique({
				where: { clan_id_map_name: { clan_id, map, name: squad.name } },
			})
			if (existing)
				throw new Error(
					'Отряд с таким названием уже есть на этой карте'
				)
		}

		return prisma.clanSquad.update({
			where: { id: squad_id },
			data: { map },
			include: squadInclude(),
		})
	}

	async setGearOverride(
		squad_id: number,
		slot: number,
		gear_override: Record<string, unknown> | null,
		actorUserId?: number
	) {
		const slotRec = await prisma.clanSquadMember.findUnique({
			where: { squad_id_slot: { squad_id, slot } },
			include: { member: { include: { user: { select: { id: true } } } } },
		})
		if (!slotRec) throw new Error('Слот пуст')

		const result = await prisma.clanSquadMember.update({
			where: { id: slotRec.id },
			data: { gear_override },
			include: memberInclude(),
		})

		if (slotRec.member.user_id && actorUserId && slotRec.member.user_id !== actorUserId) {
			const actor = actorUserId
				? await prisma.user.findUnique({ where: { id: actorUserId }, select: { username: true } })
				: null
			const squad = await prisma.clanSquad.findUnique({ where: { id: squad_id }, select: { name: true } })
			await this.notify(
				[slotRec.member.user_id],
				'Изменение снаряжения',
				`${actor?.username ?? 'Офицер'} изменил ваше снаряжение в отряде «${squad?.name ?? ''}»`,
				'/me/clan/squads',
				actor?.username
			)
		}

		return result
	}

	async removeMember(squad_id: number, slot: number) {
		const slotRec = await prisma.clanSquadMember.findUnique({
			where: { squad_id_slot: { squad_id, slot } },
		})
		if (!slotRec) throw new Error('Слот пуст')

		await prisma.clanSquadMember.delete({ where: { id: slotRec.id } })
		await prisma.clanSquad.updateMany({
			where: { id: squad_id, leader_id: slotRec.id },
			data: { leader_id: null },
		})
		return { success: true }
	}

	async requestJoin(squad_id: number, user_id: number) {
		const squad = await prisma.clanSquad.findUnique({
			where: { id: squad_id },
		})
		if (!squad) throw new Error('Отряд не найден')

		const member = await prisma.clanMember.findFirst({
			where: { clan_id: squad.clan_id, user_id },
		})
		if (!member) throw new Error('Вы не состоите в этом клане')

		const inSquad = await prisma.clanSquadMember.findFirst({
			where: { member_id: member.id, squad_id },
		})
		if (inSquad) throw new Error('Вы уже состоите в этом отряде')

		const full = await prisma.clanSquadMember.count({ where: { squad_id } })
		if (full >= MAX_SLOTS) throw new Error('В отряде нет свободных мест')

		await prisma.clanSquadRequest.deleteMany({
			where: { member_id: member.id },
		})
		return prisma.clanSquadRequest.create({
			data: { squad_id, member_id: member.id },
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

	async approveRequest(requestId: number, clan_id: string, actorUserId?: number) {
		const req = await prisma.clanSquadRequest.findUnique({
			where: { id: requestId },
			include: {
				squad: true,
				member: {
					include: {
						user: { select: { id: true } },
					},
				},
			},
		})
		if (!req) throw new Error('Заявка не найдена')
		if (req.squad.clan_id !== clan_id)
			throw new Error('Заявка не из вашего клана')

		const inSquads = await prisma.clanSquadMember.findMany({
			where: { member_id: req.member_id },
			include: { squad: true },
		})
		if (inSquads.some((m) => m.squad_id === req.squad_id)) {
			await prisma.clanSquadRequest.delete({ where: { id: requestId } })
			throw new Error('Участник уже состоит в этом отряде')
		}
		for (const m of inSquads.filter((m) => m.squad.map === req.squad.map)) {
			await prisma.clanSquadMember.delete({ where: { id: m.id } })
			await prisma.clanSquad.updateMany({
				where: { id: m.squad_id, leader_id: m.id },
				data: { leader_id: null },
			})
		}

		const count = await prisma.clanSquadMember.count({
			where: { squad_id: req.squad_id },
		})
		if (count >= MAX_SLOTS) throw new Error('В отряде нет свободных мест')

		const taken = await prisma.clanSquadMember.findMany({
			where: { squad_id: req.squad_id },
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
			data: { squad_id: req.squad_id, member_id: req.member_id, slot },
			include: memberInclude(),
		})
		await prisma.clanSquadRequest.delete({ where: { id: requestId } })

		if (req.member.user_id) {
			const squad = await prisma.clanSquad.findUnique({ where: { id: req.squad_id }, select: { name: true } })
			await this.notify(
				[req.member.user_id],
				'Заявка принята',
				`Ваша заявка в отряд «${squad?.name ?? ''}» была принята`,
				'/me/clan/squads'
			)
		}

		return result
	}

	async rejectRequest(requestId: number, clan_id: string) {
		const req = await prisma.clanSquadRequest.findUnique({
			where: { id: requestId },
			include: { squad: true },
		})
		if (!req) throw new Error('Заявка не найдена')
		if (req.squad.clan_id !== clan_id)
			throw new Error('Заявка не из вашего клана')

		await prisma.clanSquadRequest.delete({ where: { id: requestId } })
		return { success: true }
	}

	async delete(squad_id: number, user_id: number) {
		const squad = await prisma.clanSquad.findUnique({
			where: { id: squad_id },
		})
		if (!squad) throw new Error('Отряд не найден')
		if (squad.created_by !== user_id) {
			const profile = await prisma.userClanProfile.findFirst({
				where: { user_id, is_active: true },
			})
			const member = profile?.clan_id
				? await prisma.clanMember.findFirst({
						where: { clan_id: profile.clan_id, user_id },
					})
				: null
			if (!member || member.rank !== 'LEADER')
				throw new Error(
					'Удалять отряд может только лидер клана'
				)
		}

		await prisma.clanSquad.delete({ where: { id: squad_id } })
		return { success: true }
	}
}

export const squadService = new SquadService()
