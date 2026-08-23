import { rm } from 'node:fs/promises'
import type { StageType } from 'generated/prisma/enums'
import { clanService, normalizeSchedule } from '@/app/api/clan/services/clan'
import { prisma } from '@/lib/prisma'

export type AdminClanStatus = 'FROZEN' | 'ACTIVE'

export interface AdminClanUpdateInput {
	name?: string
	tag?: string
	description?: string
	status?: AdminClanStatus
	is_public?: boolean
	recruiting?: boolean
	region?: string
	schedule?: { brawls_per_week?: number; brawls_mandatory?: boolean }
}

class AdminClanService {
	async list(take: number, page: number, search?: string) {
		const where = search
			? {
					OR: [
						{
							id: {
								contains: search,
								mode: 'insensitive' as const,
							},
						},
						{
							name: {
								contains: search,
								mode: 'insensitive' as const,
							},
						},
						{
							tag: {
								contains: search,
								mode: 'insensitive' as const,
							},
						},
						{
							alliance: {
								contains: search,
								mode: 'insensitive' as const,
							},
						},
					],
				}
			: {}

		const [data, totalCount] = await Promise.all([
			prisma.clan.findMany({
				where,
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					_count: {
						select: { members: true, squads: true, sessions: true },
					},
				},
			}),
			prisma.clan.count({ where }),
		])

		return { data, total_count: totalCount, page: page + 1, take }
	}

	async get(clan_id: string) {
		const clan = await prisma.clan.findUnique({
			where: { id: clan_id },
			include: {
				_count: {
					select: { members: true, squads: true, sessions: true },
				},
			},
		})
		if (!clan) return null
		return { ...clan, schedule: normalizeSchedule(clan.schedule) }
	}

	async getMembers(clan_id: string) {
		return prisma.clanMember.findMany({
			where: { clan_id },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: [{ rank: 'asc' }, { name: 'asc' }],
		})
	}

	async update(clan_id: string, data: AdminClanUpdateInput) {
		const existing = await prisma.clan.findUnique({ where: { id: clan_id } })
		if (!existing) return null

		const schedule = data.schedule
			? {
					...normalizeSchedule(existing.schedule),
					...(data.schedule.brawls_per_week !== undefined && {
						brawls_per_week: data.schedule.brawls_per_week,
					}),
					...(data.schedule.brawls_mandatory !== undefined && {
						brawls_mandatory: data.schedule.brawls_mandatory,
					}),
				}
			: undefined

		return prisma.clan.update({
			where: { id: clan_id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.tag !== undefined && { tag: data.tag }),
				...(data.description !== undefined && {
					description: data.description,
				}),
				...(data.status !== undefined && { status: data.status }),
				...(data.is_public !== undefined && {
					is_public: data.is_public,
				}),
				...(data.recruiting !== undefined && {
					recruiting: data.recruiting,
				}),
				...(data.region !== undefined && { region: data.region }),
				...(schedule !== undefined && { schedule }),
			},
			include: {
				_count: {
					select: { members: true, squads: true, sessions: true },
				},
			},
		})
	}

	async block(clan_id: string, reason?: string) {
		const existing = await prisma.clan.findUnique({ where: { id: clan_id } })
		if (!existing) return null

		return prisma.clan.update({
			where: { id: clan_id },
			data: {
				blocked: true,
				block_reason: reason ?? null,
				blocked_at: new Date(),
			},
		})
	}

	async unblock(clan_id: string) {
		const existing = await prisma.clan.findUnique({ where: { id: clan_id } })
		if (!existing) return null

		return prisma.clan.update({
			where: { id: clan_id },
			data: {
				blocked: false,
				block_reason: null,
				blocked_at: null,
			},
		})
	}

	async remove(clan_id: string) {
		const existing = await prisma.clan.findUnique({ where: { id: clan_id } })
		if (!existing) return false

		await prisma.clan.delete({ where: { id: clan_id } })
		return true
	}

	async sync(clan_id: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clan_id } })
		if (!clan) return null

		return clanService.sync(clan_id, clan.region)
	}

	async listSessions(clan_id: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clan_id } })
		if (!clan) return null

		return prisma.stageSession.findMany({
			where: { clan_id },
			orderBy: { started_at: 'desc' },
			include: {
				_count: { select: { screenshots: true, attendance: true } },
			},
		})
	}

	async getSession(session_id: number) {
		return prisma.stageSession.findUnique({
			where: { id: session_id },
			include: {
				_count: { select: { screenshots: true, attendance: true } },
			},
		})
	}

	async updateSession(
		session_id: number,
		data: {
			map_name?: string
			type?: string
			stage_number?: number | null
			started_at?: string | null
			ended_at?: string | null
			region?: string
		}
	) {
		const existing = await prisma.stageSession.findUnique({
			where: { id: session_id },
		})
		if (!existing) return null

		const updateData: {
			map_name?: string
			type?: (typeof StageType)[keyof typeof StageType]
			stage_number?: number | null
			started_at?: Date
			ended_at?: Date | null
			region?: string
		} = {
			...(data.map_name !== undefined && { map_name: data.map_name }),
			...(data.type !== undefined && {
				type: data.type as (typeof StageType)[keyof typeof StageType],
			}),
			...(data.stage_number !== undefined && {
				stage_number: data.stage_number,
			}),
			...(data.started_at !== undefined && {
				started_at: data.started_at
					? new Date(data.started_at)
					: undefined,
			}),
			...(data.ended_at !== undefined && {
				ended_at: data.ended_at ? new Date(data.ended_at) : null,
			}),
			...(data.region !== undefined && { region: data.region }),
		}

		return prisma.stageSession.update({
			where: { id: session_id },
			data: updateData,
			include: {
				_count: { select: { screenshots: true, attendance: true } },
			},
		})
	}

	async removeSession(session_id: number) {
		const session = await prisma.stageSession.findUnique({
			where: { id: session_id },
			include: { screenshots: { select: { file_path: true } } },
		})
		if (!session) return null

		for (const shot of session.screenshots) {
			try {
				await rm(shot.file_path, { force: true })
			} catch {}
		}
		await prisma.stageSession.delete({ where: { id: session_id } })
		return { ok: true }
	}
}

export const adminClanService = new AdminClanService()
