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
	brawls_per_week: number
	brawls_mandatory: boolean
}

export const DEFAULT_SCHEDULE: ClanSchedule = {
	brawls_per_week: 4,
	brawls_mandatory: false,
}

export function normalizeSchedule(raw: unknown): ClanSchedule {
	const r = (raw ?? {}) as Record<string, unknown>
	const legacyBrawls =
		typeof r.daysPerWeek === 'number' &&
		typeof r.tournamentDays === 'number'
			? r.daysPerWeek - r.tournamentDays
			: null
	return {
		brawls_per_week: clampInt(
			r.brawls_per_week ?? legacyBrawls ?? DEFAULT_SCHEDULE.brawls_per_week,
			0,
			4,
			DEFAULT_SCHEDULE.brawls_per_week
		),
		brawls_mandatory:
			typeof r.brawls_mandatory === 'boolean'
				? r.brawls_mandatory
				: DEFAULT_SCHEDULE.brawls_mandatory,
	}
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
	if (typeof value !== 'number' || Number.isNaN(value)) return fallback
	return Math.min(max, Math.max(min, Math.round(value)))
}

export class ClanService {
	async detectFromExboCharacters(
		user_id: number,
		region: string,
		access_token: string
	) {
		const { data: chars } = await apiClient.get<ExboCharacterEntry[]>(
			`/${region}/characters`,
			{
				headers: { Authorization: `Bearer ${access_token}` },
				_skipAuth: true,
			} as never
		)

		let hasActive = await prisma.userClanProfile.findFirst({
			where: { user_id, is_active: true },
			select: { user_id: true },
		})

		for (const c of chars) {
			const clan_id = c.clan?.info?.id
			if (!clan_id) continue

			const isLeader = c.clan.member?.rank === LEADER_RANK

			await prisma.clan.upsert({
				where: {
					id: clan_id,
				},
				create: {
					id: clan_id,
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
				where: { user_id_clan_id: { user_id, clan_id } },
				create: { user_id, clan_id, region, is_active: activate },
				update: { region },
			})
			if (activate) hasActive = { user_id }
		}
	}

	async getActiveProfile(user_id: number) {
		let profile = await prisma.userClanProfile.findFirst({
			where: { user_id, is_active: true },
			include: { clan: true },
		})
		if (!profile) {
			profile = await prisma.userClanProfile.findFirst({
				where: { user_id },
				include: { clan: true },
			})
			if (profile) {
				await prisma.userClanProfile.update({
					where: {
						user_id_clan_id: {
							user_id: profile.user_id,
							clan_id: profile.clan_id,
						},
					},
					data: { is_active: true },
				})
				profile.is_active = true
			}
		}
		return profile
	}

	async register(user_id: number) {
		const profile = await this.getActiveProfile(user_id)
		if (!profile?.clan_id) throw new Error('No clan linked to user')

		try {
			await this.sync(profile.clan_id, profile.region)
		} catch (err) {
			console.error('[Clan] Sync skipped during register:', err)
		}
		await prisma.clan.update({
			where: { id: profile.clan_id },
			data: { status: 'ACTIVE' },
		})
		return prisma.clan.findUnique({ where: { id: profile.clan_id } })
	}

	async freeze(clan_id: string) {
		return prisma.clan.update({
			where: { id: clan_id },
			data: { status: 'FROZEN' },
		})
	}

	async sync(clan_id: string, region?: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clan_id } })
		const reg = region ?? clan?.region ?? 'RU'

		const { data: info } = await apiClient.get<ExboClanInfo>(
			`/${reg}/clan/${clan_id}/info`
		)

		const access_token = await this.getMemberAccessToken(clan_id)
		let members: ExboClanMember[] = []
		if (access_token) {
			const { data } = await apiClient.get<ExboClanMember[]>(
				`/${reg}/clan/${clan_id}/members`,
				{
					params: { limit: 100, offset: 0 },
					headers: { Authorization: `Bearer ${access_token}` },
					_skipAuth: true,
				} as never
			)
			members = data
		}

		await prisma.clan.update({
			where: { id: clan_id },
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
				where: { clan_id },
				data: { region: reg },
			})
		}

		await prisma.clanMember.deleteMany({ where: { clan_id } })

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
					clan_id,
					name: m.name,
					rank: m.rank,
					join_time: m.joinTime ? new Date(m.joinTime) : null,
					user_id: linkedUserId,
				},
			})
			if (linkedUserId != null) {
				const existing = await prisma.userClanProfile.findFirst({
					where: { user_id: linkedUserId, clan_id },
					select: { user_id: true },
				})
				if (!existing) {
					const hasActive = await prisma.userClanProfile.findFirst({
						where: { user_id: linkedUserId, is_active: true },
						select: { user_id: true },
					})
					await prisma.userClanProfile.create({
						data: {
							user_id: linkedUserId,
							clan_id,
							region: reg,
							is_active: !hasActive,
						},
					})
				}
			}
		}
		return {
			clan_id,
			member_count: members.length,
			members_synced: !!access_token,
		}
	}

	private async getMemberAccessToken(clan_id: string): Promise<string | null> {
		const profiles = await prisma.userClanProfile.findMany({
			where: { clan_id },
			include: {
				user: {
					include: {
						exbo_auth: {
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
			const auth = p.user.exbo_auth
			if (!auth) continue
			if (auth.access_expires_at <= new Date()) continue
			const { access_token } = decryptSecretJson<{
				access_token: string
			}>(auth.token_blob)
			if (access_token) return access_token
		}
		return null
	}

	async listMembers(clan_id: string) {
		return prisma.clanMember.findMany({
			where: { clan_id },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: { rank: 'asc' },
		})
	}

	async getClan(clan_id: string) {
		return prisma.clan.findUnique({ where: { id: clan_id } })
	}

	async getMe(user_id: number) {
		return this.getActiveProfile(user_id)
	}

	async getMyClans(user_id: number) {
		const profiles = await prisma.userClanProfile.findMany({
			where: { user_id },
			include: { clan: true },
			orderBy: { updated_at: 'desc' },
		})
		return profiles
	}

	async switchClan(user_id: number, clan_id: string) {
		const target = await prisma.userClanProfile.findUnique({
			where: { user_id_clan_id: { user_id, clan_id } },
		})
		if (!target) throw new Error('You are not a member of this clan')

		await prisma.$transaction([
			prisma.userClanProfile.updateMany({
				where: { user_id, is_active: true },
				data: { is_active: false },
			}),
			prisma.userClanProfile.update({
				where: { user_id_clan_id: { user_id, clan_id } },
				data: { is_active: true },
			}),
		])
	}

	async getPublicPayload(clan_id: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clan_id } })
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

	async updatePublicSettings(clan_id: string, data: { is_public?: boolean }) {
		return prisma.clan.update({
			where: { id: clan_id },
			data: {
				...(data.is_public !== undefined && {
					is_public: data.is_public,
				}),
			},
		})
	}

	async getSettings(clan_id: string) {
		const clan = await prisma.clan.findUnique({ where: { id: clan_id } })
		if (!clan) return null
		return {
			is_public: clan.is_public,
			schedule: normalizeSchedule(clan.schedule),
			boost_mode: clan.boost_mode,
			grenade_mode: clan.grenade_mode,
		}
	}

	async updateBoostMode(clan_id: string, boost_mode: 'ISSUED' | 'SELF') {
		return prisma.clan.update({
			where: { id: clan_id },
			data: { boost_mode },
		})
	}

	async updateGrenadeMode(clan_id: string, grenade_mode: 'ISSUED' | 'SELF') {
		return prisma.clan.update({
			where: { id: clan_id },
			data: { grenade_mode },
		})
	}

	async updateSchedule(clan_id: string, data: Partial<ClanSchedule>) {
		const clan = await prisma.clan.findUnique({ where: { id: clan_id } })
		if (!clan) throw new Error('Clan not found')
		const current = normalizeSchedule(clan.schedule)
		const merged: ClanSchedule = {
			brawls_per_week: data.brawls_per_week ?? current.brawls_per_week,
			brawls_mandatory: data.brawls_mandatory ?? current.brawls_mandatory,
		}
		return prisma.clan.update({
			where: { id: clan_id },
			data: { schedule: merged },
		})
	}

	async updateRecruiting(clan_id: string, recruiting: boolean) {
		return prisma.clan.update({
			where: { id: clan_id },
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
