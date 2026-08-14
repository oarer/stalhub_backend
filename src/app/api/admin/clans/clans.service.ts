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
	schedule?: { brawlsPerWeek?: number; brawlsMandatory?: boolean }
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

		return { data, total: totalCount }
	}

	async get(clanId: string) {
		const clan = await prisma.clan.findUnique({
			where: { id: clanId },
			include: {
				_count: {
					select: { members: true, squads: true, sessions: true },
				},
			},
		})
		if (!clan) return null
		return { ...clan, schedule: normalizeSchedule(clan.schedule) }
	}

	async getMembers(clanId: string) {
		return prisma.clanMember.findMany({
			where: { clanId },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: [{ rank: 'asc' }, { name: 'asc' }],
		})
	}

	async update(clanId: string, data: AdminClanUpdateInput) {
		const existing = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!existing) return null

		const schedule = data.schedule
			? {
					...normalizeSchedule(existing.schedule),
					...(data.schedule.brawlsPerWeek !== undefined && {
						brawlsPerWeek: data.schedule.brawlsPerWeek,
					}),
					...(data.schedule.brawlsMandatory !== undefined && {
						brawlsMandatory: data.schedule.brawlsMandatory,
					}),
				}
			: undefined

		return prisma.clan.update({
			where: { id: clanId },
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

	async block(clanId: string, reason?: string) {
		const existing = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!existing) return null

		return prisma.clan.update({
			where: { id: clanId },
			data: {
				blocked: true,
				block_reason: reason ?? null,
				blocked_at: new Date(),
			},
		})
	}

	async unblock(clanId: string) {
		const existing = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!existing) return null

		return prisma.clan.update({
			where: { id: clanId },
			data: {
				blocked: false,
				block_reason: null,
				blocked_at: null,
			},
		})
	}

	async remove(clanId: string) {
		const existing = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!existing) return false

		await prisma.clan.delete({ where: { id: clanId } })
		return true
	}

	async sync(clanId: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!clan) return null

		return clanService.sync(clanId, clan.region)
	}

	async listSessions(clanId: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!clan) return null

		return prisma.stageSession.findMany({
			where: { clanId },
			orderBy: { started_at: 'desc' },
			include: {
				_count: { select: { screenshots: true, attendance: true } },
			},
		})
	}

	async getSession(sessionId: number) {
		return prisma.stageSession.findUnique({
			where: { id: sessionId },
			include: {
				_count: { select: { screenshots: true, attendance: true } },
			},
		})
	}

	async updateSession(
		sessionId: number,
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
			where: { id: sessionId },
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
			where: { id: sessionId },
			data: updateData,
			include: {
				_count: { select: { screenshots: true, attendance: true } },
			},
		})
	}

	async removeSession(sessionId: number) {
		const session = await prisma.stageSession.findUnique({
			where: { id: sessionId },
			include: { screenshots: { select: { file_path: true } } },
		})
		if (!session) return null

		for (const shot of session.screenshots) {
			try {
				await rm(shot.file_path, { force: true })
			} catch {}
		}
		await prisma.stageSession.delete({ where: { id: sessionId } })
		return { ok: true }
	}
}

export const adminClanService = new AdminClanService()
