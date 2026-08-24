import { rm } from 'node:fs/promises'
import type { StageType } from 'generated/prisma/enums'
import {
	assertRecruitingAllowed,
	clanService,
	normalizeSchedule,
	type SundayActivity,
} from '@/app/api/clan/services/clan'
import { prisma } from '@/lib/prisma'
import {
	applySessionRating,
	deleteSessionWithRating,
} from '@/app/api/clan/services/rating'

export type AdminClanStatus = 'FROZEN' | 'ACTIVE'

export interface AdminClanUpdateInput {
	name?: string
	tag?: string
	description?: string
	status?: AdminClanStatus
	is_public?: boolean
	recruiting?: boolean
	region?: string
	schedule?: {
		brawls_per_week?: number
		brawls_mandatory?: boolean
		sunday_activity?: SundayActivity
	}
}

class AdminClanService {
	async listSeasons() {
		return prisma.clanSeason.findMany({ orderBy: { starts_at: 'desc' } })
	}

	async createSeason(data: { name: string; starts_at: string; ends_at: string }) {
		return this.saveSeason(null, data)
	}

	async updateSeason(
		season_id: number,
		data: { name: string; starts_at: string; ends_at: string }
	) {
		return this.saveSeason(season_id, data)
	}

	private async saveSeason(
		season_id: number | null,
		data: { name: string; starts_at: string; ends_at: string }
	) {
		const starts_at = new Date(data.starts_at)
		const ends_at = new Date(data.ends_at)
		if (!data.name.trim()) throw new Error('Season name is required')
		if (Number.isNaN(starts_at.getTime()) || Number.isNaN(ends_at.getTime()) || ends_at <= starts_at)
			throw new Error('Season end must be after its start')
		const overlap = await prisma.clanSeason.findFirst({
			where: {
				...(season_id != null && { id: { not: season_id } }),
				starts_at: { lt: ends_at },
				ends_at: { gt: starts_at },
			},
			select: { id: true },
		})
		if (overlap) throw new Error('Season dates overlap another season')
		const values = { name: data.name.trim(), starts_at, ends_at }
		return season_id == null
			? prisma.clanSeason.create({ data: values })
			: prisma.clanSeason.update({ where: { id: season_id }, data: values })
	}

	async removeSeason(season_id: number) {
		const events = await prisma.clanRatingEvent.count({ where: { season_id } })
		if (events > 0) throw new Error('Season with rating events cannot be deleted')
		await prisma.clanSeason.delete({ where: { id: season_id } })
		return { ok: true }
	}

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
		const existing = await prisma.clan.findUnique({
			where: { id: clan_id },
		})
		if (!existing) return null
		assertRecruitingAllowed(
			data.recruiting ?? existing.recruiting,
			existing.leader_discord
		)

		const schedule = data.schedule
			? {
					...normalizeSchedule(existing.schedule),
					...(data.schedule.brawls_per_week !== undefined && {
						brawls_per_week: data.schedule.brawls_per_week,
					}),
					...(data.schedule.brawls_mandatory !== undefined && {
						brawls_mandatory: data.schedule.brawls_mandatory,
					}),
					...(data.schedule.sunday_activity !== undefined && {
						sunday_activity: data.schedule.sunday_activity,
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
		const existing = await prisma.clan.findUnique({
			where: { id: clan_id },
		})
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
		const existing = await prisma.clan.findUnique({
			where: { id: clan_id },
		})
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
		const existing = await prisma.clan.findUnique({
			where: { id: clan_id },
		})
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

		const updated = await prisma.stageSession.update({
			where: { id: session_id },
			data: updateData,
			include: {
				_count: { select: { screenshots: true, attendance: true } },
			},
		})
		const victory =
			(updated.ai_summary as { victory?: boolean | null } | null)?.victory ?? null
		await applySessionRating(session_id, victory)
		return updated
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
		return deleteSessionWithRating(session_id)
	}
}

export const adminClanService = new AdminClanService()
