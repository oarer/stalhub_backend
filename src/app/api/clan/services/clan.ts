import { apiClient } from '@/app/interceptors/sc.interceptor'
import { prisma } from '@/lib/prisma'
import { decryptSecretJson } from '@/utils/crypto'

interface ExboCharacterEntry {
	information: { id: string; name: string }
	clan: {
		info: ExboClanInfo
		member: { name: string; rank: string; joinTime: string }
	}
}
interface ExboClanInfo {
	id: string
	name: string
	tag: string
	level: number
	levelPoints: number
	registrationTime: string
	alliance: string
	description: string
	leader: string
	memberCount: number
}
interface ExboClanMember {
	name: string
	rank: string
	joinTime: string
}

const LEADER_RANK = 'LEADER'

export const TOURNAMENT_DAYS = 3

export type ClanSchedule = {
	brawlsPerWeek: number
	brawlsMandatory: boolean
}

export const DEFAULT_SCHEDULE: ClanSchedule = {
	brawlsPerWeek: 4,
	brawlsMandatory: false,
}

export function normalizeSchedule(raw: unknown): ClanSchedule {
	const r = (raw ?? {}) as Record<string, unknown>
	const legacyBrawls =
		typeof r.daysPerWeek === 'number' &&
		typeof r.tournamentDays === 'number'
			? r.daysPerWeek - r.tournamentDays
			: null
	return {
		brawlsPerWeek: clampInt(
			r.brawlsPerWeek ?? legacyBrawls ?? DEFAULT_SCHEDULE.brawlsPerWeek,
			0,
			4,
			DEFAULT_SCHEDULE.brawlsPerWeek
		),
		brawlsMandatory:
			typeof r.brawlsMandatory === 'boolean'
				? r.brawlsMandatory
				: DEFAULT_SCHEDULE.brawlsMandatory,
	}
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
	if (typeof value !== 'number' || Number.isNaN(value)) return fallback
	return Math.min(max, Math.max(min, Math.round(value)))
}

export class ClanService {
	async detectFromExboCharacters(
		userId: number,
		region: string,
		accessToken: string
	) {
		const { data: chars } = await apiClient.get<ExboCharacterEntry[]>(
			`/${region}/characters`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
				_skipAuth: true,
			} as never
		)

		let hasActive = await prisma.userClanProfile.findFirst({
			where: { userId, isActive: true },
			select: { userId: true },
		})

		for (const c of chars) {
			const clanId = c.clan?.info?.id
			if (!clanId) continue

			const isLeader = c.clan.member?.rank === LEADER_RANK

			await prisma.clan.upsert({
				where: {
					id: clanId,
				},
				create: {
					id: clanId,
					name: c.clan.info.name,
					tag: c.clan.info.tag,
					level: c.clan.info.level,
					level_points: c.clan.info.levelPoints,
					alliance: c.clan.info.alliance,
					description: c.clan.info.description,
					leader: c.clan.info.leader,
					member_count: c.clan.info.memberCount,
					region,
					status: isLeader ? 'FROZEN' : 'FROZEN',
				},
				update: {
					name: c.clan.info.name,
					tag: c.clan.info.tag,
					level: c.clan.info.level,
					level_points: c.clan.info.levelPoints,
					alliance: c.clan.info.alliance,
					description: c.clan.info.description,
					leader: c.clan.info.leader,
					member_count: c.clan.info.memberCount,
					region,
				},
			})

			const activate = !hasActive
			await prisma.userClanProfile.upsert({
				where: { userId_clanId: { userId, clanId } },
				create: { userId, clanId, region, isActive: activate },
				update: { region },
			})
			if (activate) hasActive = { userId }
		}
	}

	async getActiveProfile(userId: number) {
		let profile = await prisma.userClanProfile.findFirst({
			where: { userId, isActive: true },
			include: { clan: true },
		})
		if (!profile) {
			profile = await prisma.userClanProfile.findFirst({
				where: { userId },
				include: { clan: true },
			})
			if (profile) {
				await prisma.userClanProfile.update({
					where: {
						userId_clanId: {
							userId: profile.userId,
							clanId: profile.clanId,
						},
					},
					data: { isActive: true },
				})
				profile.isActive = true
			}
		}
		return profile
	}

	async register(userId: number) {
		const profile = await this.getActiveProfile(userId)
		if (!profile?.clanId) throw new Error('No clan linked to user')

		try {
			await this.sync(profile.clanId, profile.region)
		} catch (err) {
			console.error('[Clan] Sync skipped during register:', err)
		}
		await prisma.clan.update({
			where: { id: profile.clanId },
			data: { status: 'ACTIVE' },
		})
		return prisma.clan.findUnique({ where: { id: profile.clanId } })
	}

	async freeze(clanId: string) {
		return prisma.clan.update({
			where: { id: clanId },
			data: { status: 'FROZEN' },
		})
	}

	async sync(clanId: string, region?: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clanId } })
		const reg = region ?? clan?.region ?? 'RU'

		const { data: info } = await apiClient.get<ExboClanInfo>(
			`/${reg}/clan/${clanId}/info`
		)

		const accessToken = await this.getMemberAccessToken(clanId)
		let members: ExboClanMember[] = []
		if (accessToken) {
			const { data } = await apiClient.get<ExboClanMember[]>(
				`/${reg}/clan/${clanId}/members`,
				{
					params: { limit: 100, offset: 0 },
					headers: { Authorization: `Bearer ${accessToken}` },
					_skipAuth: true,
				} as never
			)
			members = data
		}

		await prisma.clan.update({
			where: { id: clanId },
			data: {
				name: info.name,
				tag: info.tag,
				level: info.level,
				level_points: info.levelPoints,
				alliance: info.alliance,
				description: info.description,
				leader: info.leader,
				member_count: info.memberCount,
				region: reg,
			},
		})

		if (reg !== clan?.region) {
			await prisma.userClanProfile.updateMany({
				where: { clanId },
				data: { region: reg },
			})
		}

		await prisma.clanMember.deleteMany({ where: { clanId } })

		const memberNames = members.map((m) => m.name)
		const [exboAuths, usersByUsername, guestsByName] = await Promise.all([
			prisma.eXBOAuth.findMany({
				where: { username: { in: memberNames, mode: 'insensitive' } },
				select: { userid: true, username: true },
			}),
			prisma.user.findMany({
				where: { username: { in: memberNames, mode: 'insensitive' } },
				select: { id: true, username: true },
			}),
			prisma.user.findMany({
				where: {
					name: { in: memberNames, mode: 'insensitive' },
					roles: { some: { name: 'clan_guest' } },
				},
				select: { id: true, name: true },
			}),
		])
		const exboByLower = new Map(
			exboAuths.map((a) => [a.username.toLowerCase(), a.userid])
		)
		const usernameByLower = new Map(
			usersByUsername.map((u) => [u.username.toLowerCase(), u.id])
		)
		const guestNameByLower = new Map(
			guestsByName.map((u) => [u.name.toLowerCase(), u.id])
		)

		for (const m of members) {
			const key = m.name.toLowerCase()
			const linkedUserId =
				exboByLower.get(key) ??
				usernameByLower.get(key) ??
				guestNameByLower.get(key) ??
				null
			await prisma.clanMember.create({
				data: {
					clanId,
					name: m.name,
					rank: m.rank,
					join_time: m.joinTime ? new Date(m.joinTime) : null,
					userId: linkedUserId,
				},
			})
			if (linkedUserId != null) {
				const existing = await prisma.userClanProfile.findFirst({
					where: { userId: linkedUserId, clanId },
					select: { userId: true },
				})
				if (!existing) {
					const hasActive = await prisma.userClanProfile.findFirst({
						where: { userId: linkedUserId, isActive: true },
						select: { userId: true },
					})
					await prisma.userClanProfile.create({
						data: {
							userId: linkedUserId,
							clanId,
							region: reg,
							isActive: !hasActive,
						},
					})
				}
			}
		}
		return {
			clanId,
			memberCount: members.length,
			membersSynced: !!accessToken,
		}
	}

	private async getMemberAccessToken(clanId: string): Promise<string | null> {
		const profiles = await prisma.userClanProfile.findMany({
			where: { clanId },
			include: {
				user: {
					include: {
						EXBOAuth: {
							select: {
								token_blob: true,
								access_expires_at: true,
							},
						},
					},
				},
			},
		})
		for (const p of profiles) {
			const auth = p.user.EXBOAuth
			if (!auth) continue
			if (auth.access_expires_at <= new Date()) continue
			const { access_token } = decryptSecretJson<{
				access_token: string
			}>(auth.token_blob)
			if (access_token) return access_token
		}
		return null
	}

	async listMembers(clanId: string) {
		return prisma.clanMember.findMany({
			where: { clanId },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: { rank: 'asc' },
		})
	}

	async getClan(clanId: string) {
		return prisma.clan.findUnique({ where: { id: clanId } })
	}

	async getMe(userId: number) {
		return this.getActiveProfile(userId)
	}

	async getMyClans(userId: number) {
		const profiles = await prisma.userClanProfile.findMany({
			where: { userId },
			include: { clan: true },
			orderBy: { updated_at: 'desc' },
		})
		return profiles
	}

	async switchClan(userId: number, clanId: string) {
		const target = await prisma.userClanProfile.findUnique({
			where: { userId_clanId: { userId, clanId } },
		})
		if (!target) throw new Error('You are not a member of this clan')

		await prisma.$transaction([
			prisma.userClanProfile.updateMany({
				where: { userId, isActive: true },
				data: { isActive: false },
			}),
			prisma.userClanProfile.update({
				where: { userId_clanId: { userId, clanId } },
				data: { isActive: true },
			}),
		])
	}

	async getPublicPayload(clanId: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!clan || !clan.is_public) return null
		return publicClanPayload(clan)
	}

	async listPublicClans() {
		const clans = await prisma.clan.findMany({
			where: { is_public: true },
			orderBy: { created_at: 'desc' },
		})
		return clans.map(publicClanPayload)
	}

	async updatePublicSettings(clanId: string, data: { is_public?: boolean }) {
		return prisma.clan.update({
			where: { id: clanId },
			data: {
				...(data.is_public !== undefined && {
					is_public: data.is_public,
				}),
			},
		})
	}

	async getSettings(clanId: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!clan) return null
		return {
			is_public: clan.is_public,
			schedule: normalizeSchedule(clan.schedule),
			boost_mode: clan.boost_mode,
			grenade_mode: clan.grenade_mode,
		}
	}

	async updateBoostMode(clanId: string, boost_mode: 'ISSUED' | 'SELF') {
		return prisma.clan.update({
			where: { id: clanId },
			data: { boost_mode },
		})
	}

	async updateGrenadeMode(clanId: string, grenade_mode: 'ISSUED' | 'SELF') {
		return prisma.clan.update({
			where: { id: clanId },
			data: { grenade_mode },
		})
	}

	async updateSchedule(clanId: string, data: Partial<ClanSchedule>) {
		const clan = await prisma.clan.findUnique({ where: { id: clanId } })
		if (!clan) throw new Error('Clan not found')
		const current = normalizeSchedule(clan.schedule)
		const merged: ClanSchedule = {
			brawlsPerWeek: data.brawlsPerWeek ?? current.brawlsPerWeek,
			brawlsMandatory: data.brawlsMandatory ?? current.brawlsMandatory,
		}
		return prisma.clan.update({
			where: { id: clanId },
			data: { schedule: merged },
		})
	}

	async updateRecruiting(clanId: string, recruiting: boolean) {
		return prisma.clan.update({
			where: { id: clanId },
			data: { recruiting },
		})
	}
}
export const clanService = new ClanService()

function publicClanPayload(clan: {
	id: string
	name: string
	tag: string
	alliance: string
	description: string
	leader: string
	member_count: number
	status: string
	is_public: boolean
	recruiting: boolean
	schedule: unknown
	boost_mode: string
	grenade_mode: string
	created_at: Date
}) {
	return {
		id: clan.id,
		name: clan.name,
		tag: clan.tag,
		alliance: clan.alliance,
		description: clan.description,
		leader: clan.leader,
		member_count: clan.member_count,
		status: clan.status,
		is_public: clan.is_public,
		recruiting: clan.recruiting,
		schedule: normalizeSchedule(clan.schedule),
		boost_mode: clan.boost_mode,
		grenade_mode: clan.grenade_mode,
		created_at: clan.created_at,
	}
}
