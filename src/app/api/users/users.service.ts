import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
	type AvatarSource,
	type BannerMode,
	type BannerType,
	type CardBackground,
	type Prisma,
	StarTargetType,
	type UserLayout,
} from 'generated/prisma/client'
import { decompress } from '@/app/api/builds/builds.service'
import { clanService, normalizeSchedule } from '@/app/api/clan/services/clan'
import { prisma } from '@/lib/prisma'
import { authService } from '@/utils/auth.service'
import { decryptSecretJson } from '@/utils/crypto'

const USERNAME_COOLDOWN_DAYS = 30

function parseUserAgent(ua: string) {
	const isMobile = /mobile|android|iphone|ipad|tablet/i.test(ua)
	let browser: string | null = null
	let browserVersion: string | null = null

	const patterns = [
		{ name: 'Chrome', regex: /Chrome\/([\d.]+)/ },
		{ name: 'Firefox', regex: /Firefox\/([\d.]+)/ },
		{ name: 'Safari', regex: /Version\/([\d.]+).*Safari/ },
		{ name: 'Edge', regex: /Edg\/([\d.]+)/ },
		{ name: 'Opera', regex: /OPR\/([\d.]+)/ },
	]

	for (const { name, regex } of patterns) {
		const match = ua.match(regex)
		if (match) {
			browser = name
			browserVersion = match[1]
			break
		}
	}

	return { isMobile, browser, browserVersion }
}

type AuthorPayload = {
	id: number
	name: string | null
	username: string | null
}

type StarItem = {
	id: number
	external_id: string
	title: string
	author: AuthorPayload | null
	created_at: Date
}

class UsersService {
	async saveBanner(
		user_id: number,
		file: { name: string; type: string; buffer: Buffer }
	) {
		const bannerDir = './uploads/users/banners'
		await mkdir(bannerDir, { recursive: true })

		const existing = await prisma.userCustomization.findUnique({
			where: { user_id },
			select: { banner_image: true },
		})
		const oldPath = existing?.banner_image
		if (
			oldPath &&
			oldPath.startsWith('/uploads/users/banners/') &&
			!oldPath.includes('..')
		) {
			await rm(path.join('.', oldPath), { force: true }).catch(() => {})
		}

		const ext = path.extname(file.name) || '.png'
		const filename = `${user_id}-${randomUUID()}${ext}`
		const fullPath = path.join(bannerDir, filename)
		await writeFile(fullPath, file.buffer)

		const banner_image = `/uploads/users/banners/${filename}`
		await prisma.userCustomization.upsert({
			where: { user_id },
			update: { banner_image, banner_mode: 'IMAGE' },
			create: { user_id, banner_image, banner_mode: 'IMAGE' },
		})

		return { banner_image: banner_image }
	}

	async saveAvatar(
		user_id: number,
		file: { name: string; type: string; buffer: Buffer }
	) {
		const avatarDir = './uploads/users/avatars'
		await mkdir(avatarDir, { recursive: true })

		const existing = await prisma.userCustomization.findUnique({
			where: { user_id },
			select: { avatar_image: true },
		})
		const oldPath = existing?.avatar_image
		if (
			oldPath &&
			oldPath.startsWith('/uploads/users/avatars/') &&
			!oldPath.includes('..')
		) {
			await rm(path.join('.', oldPath), { force: true }).catch(() => {})
		}

		const ext = path.extname(file.name) || '.png'
		const filename = `${user_id}-${randomUUID()}${ext}`
		const fullPath = path.join(avatarDir, filename)
		await writeFile(fullPath, file.buffer)

		const avatar_image = `/uploads/users/avatars/${filename}`
		await prisma.userCustomization.upsert({
			where: { user_id },
			update: { avatar_image },
			create: { user_id, avatar_image },
		})

		return { avatar_image: avatar_image }
	}

	async clearAvatar(user_id: number) {
		const existing = await prisma.userCustomization.findUnique({
			where: { user_id },
			select: { avatar_image: true },
		})
		const oldPath = existing?.avatar_image
		if (
			oldPath &&
			oldPath.startsWith('/uploads/users/avatars/') &&
			!oldPath.includes('..')
		) {
			await rm(path.join('.', oldPath), { force: true }).catch(() => {})
		}

		await prisma.userCustomization.updateMany({
			where: { user_id },
			data: { avatar_image: null },
		})
		

		return { ok: true }
	}

	async getMe(session_id: string) {
		const session = await authService.getSession(session_id)
		return authService.userPayload(session!)
	}

	async updateSettings(
		user_id: number,
		data: {
			public_profile?: boolean
			layout?: UserLayout

			banner_mode?: BannerMode
			banner_type?: BannerType
			banner_color?: string
			banner_image?: string

			card_background?: CardBackground
			card_color?: string
			avatar?: AvatarSource

			region?: string
		}
	) {
		if (Object.keys(data).length === 0) {
			return { error: 'No valid fields to update' }
		}

		const { public_profile, region, ...customization } = data

		const [settings, userCustomization] = await Promise.all([
			public_profile !== undefined
				? prisma.userSettings.upsert({
						where: { user_id },
						update: { public_profile },
						create: { user_id, public_profile },
					})
				: Promise.resolve(null),
			Object.keys(customization).length > 0
				? prisma.userCustomization.upsert({
						where: { user_id },
						update: customization,
						create: { user_id, ...customization },
					})
				: Promise.resolve(null),
		])

		if (region) {
			const user = await prisma.user.findUnique({
				where: { id: user_id },
				include: { exbo_auth: true },
			})

			if (user?.exbo_auth) {
				await prisma.eXBOAuth.update({
					where: { id: user.exbo_auth.id },
					data: { region, region_changed_at: new Date() },
				})

				try {
					const { access_token } = decryptSecretJson<{
						access_token: string
					}>(user.exbo_auth.token_blob)
					if (access_token) {
						await clanService.detectFromExboCharacters(
							user_id,
							region,
							access_token
						)
					}
				} catch {
					// no block
				}
			}
		}

		return { settings, userCustomization }
	}

	async updateSocialLinks(
		user_id: number,
		socialLinks: Record<string, string>
	) {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
			select: { id: true },
		})
		if (!user) return { error: 'User not found' }

		const pruned: Record<string, string> = {}
		for (const [key, value] of Object.entries(socialLinks)) {
			const url = value.trim()
			if (!url) continue
			pruned[key.trim().toLowerCase()] = url
		}

		await prisma.user.update({
			where: { id: user_id },
			data: { social_links: pruned },
		})

		return { success: true }
	}

	async updateProfile(
		user_id: number,
		data: {
			name?: string
			username?: string
		}
	) {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
			select: { username_changed_at: true },
		})
		if (!user) return { error: 'User not found' }

		if (data.username) {
			const daysSinceLastChange = Math.floor(
				(Date.now() - user.username_changed_at.getTime()) /
					(1000 * 60 * 60 * 24)
			)
			if (daysSinceLastChange < USERNAME_COOLDOWN_DAYS) {
				const daysLeft = USERNAME_COOLDOWN_DAYS - daysSinceLastChange
				return {
					error: `Username can be changed once every ${USERNAME_COOLDOWN_DAYS} days. ${daysLeft} days remaining.`,
				}
			}

			const existing = await prisma.user.findUnique({
				where: { username: data.username },
				select: { id: true },
			})
			if (existing) return { error: 'Username is already taken' }
		}

		const updateData: {
			name?: string
			username?: string
			username_changed_at?: Date
		} = {}
		if (data.name) updateData.name = data.name
		if (data.username) {
			updateData.username = data.username
			updateData.username_changed_at = new Date()
		}

		if (Object.keys(updateData).length === 0) {
			return { error: 'No valid fields to update' }
		}

		return prisma.user.update({
			where: { id: user_id },
			data: updateData,
			select: {
				id: true,
				username: true,
				name: true,
				username_changed_at: true,
			},
		})
	}

	async completeOnboarding(
		user_id: number,
		data: {
			name?: string
			username?: string
			region?: string
			layout?: UserLayout
			banner_mode?: BannerMode
			banner_type?: BannerType
			banner_color?: string
			banner_image?: string
			card_background?: CardBackground
			card_color?: string
		}
	) {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
			include: { exbo_auth: true },
		})
		if (!user) return { error: 'User not found' }

		if (data.username) {
			const existing = await prisma.user.findUnique({
				where: { username: data.username },
				select: { id: true },
			})
			if (existing && existing.id !== user_id) {
				return { error: 'Username is already taken' }
			}
		}

		const userUpdate: {
			name?: string
			username?: string
			username_changed_at?: Date
			onboarded: boolean
		} = { onboarded: true }
		if (data.name) userUpdate.name = data.name
		if (data.username) {
			userUpdate.username = data.username
			userUpdate.username_changed_at = new Date()
		}

		const customization: Record<string, unknown> = {}
		if (data.layout) customization.layout = data.layout
		if (data.banner_mode) customization.banner_mode = data.banner_mode
		if (data.banner_type) customization.banner_type = data.banner_type
		if (data.banner_color) customization.banner_color = data.banner_color
		if (data.banner_image) customization.banner_image = data.banner_image
		if (data.card_background)
			customization.card_background = data.card_background
		if (data.card_color) customization.card_color = data.card_color

		await Promise.all([
			prisma.user.update({ where: { id: user_id }, data: userUpdate }),
			Object.keys(customization).length > 0
				? prisma.userCustomization.upsert({
						where: { user_id },
						update: customization,
						create: { user_id, ...customization },
					})
				: Promise.resolve(null),
			user.exbo_auth && data.region
				? prisma.eXBOAuth.update({
						where: { id: user.exbo_auth.id },
						data: {
							region: data.region,
							region_changed_at: new Date(),
						},
					})
				: Promise.resolve(null),
		])

		if (user.exbo_auth && data.region) {
			try {
				const { access_token } = decryptSecretJson<{
					access_token: string
				}>(user.exbo_auth.token_blob)
				if (access_token) {
					await clanService.detectFromExboCharacters(
						user_id,
						data.region,
						access_token
					)
				}
			} catch {
				// no block
			}
		}

		return { success: true }
	}

	async revokeSession(session_id: string) {
		await authService.revokeSession(session_id)
	}

	async deleteAccount(user_id: number) {
		await prisma.user.delete({ where: { id: user_id } })
	}

	async getSessions(user_id: number, currentSessionId: string) {
		const sessions = await prisma.sessions.findMany({
			where: { user_id, revoked: false },
			orderBy: { last_used_at: 'desc' },
		})

		return sessions.map((s) => {
			const info = parseUserAgent(s.user_agent)
			return {
				id: s.id,
				last_accessed: s.last_used_at,
				is_self: s.session_id === currentSessionId,
				is_mobile: info.isMobile,
				browser: info.browser,
				browser_version: info.browserVersion,
				ip: s.ip,
			}
		})
	}

	async revokeAllSessions(user_id: number, currentSessionId: string) {
		await prisma.sessions.updateMany({
			where: {
				user_id,
				session_id: { not: currentSessionId },
				revoked: false,
			},
			data: { revoked: true },
		})
	}

	async revokeSessionById(id: number, user_id: number) {
		await prisma.sessions.updateMany({
			where: { id, user_id, revoked: false },
			data: { revoked: true },
		})
	}

	async getSettings(user_id: number) {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
			include: {
				user_settings: true,
				customization: true,
				discord_auth: true,
				telegram_auth: true,
				exbo_auth: true,
			},
		})

		if (!user) return null

		const available: string[] = []
		if (user.discord_auth) available.push('discord')
		if (user.telegram_auth) available.push('telegram')
		if (user.exbo_auth) available.push('exbo')

		const worksCount = 0

		return {
			user_id: user.id,
			public_profile: user.user_settings?.public_profile ?? false,
			can_be_public: worksCount > 0,
			avatar: {
				current: user.customization?.avatar?.toLowerCase() ?? 'discord',
				available,
			},
			avatar_image: user.customization?.avatar_image ?? null,
			region: user.exbo_auth?.region ?? null,
			region_changed_at: user.exbo_auth?.region_changed_at ?? null,
		}
	}

	async getNotifications(user_id: number, take: number, page: number) {
		const [data, totalCount] = await Promise.all([
			prisma.notifications.findMany({
				where: { users: { some: { id: user_id } } },
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
			}),
			prisma.notifications.count({
				where: { users: { some: { id: user_id } } },
			}),
		])

		return { data, total_count: totalCount, page: page + 1, take }
	}

	async getUnreadCount(user_id: number) {
		return prisma.notifications.count({
			where: {
				users: { some: { id: user_id } },
				read: false,
			},
		})
	}

	async markRead(user_id: number, notificationId: number) {
		const notification = await prisma.notifications.findFirst({
			where: {
				id: notificationId,
				users: { some: { id: user_id } },
			},
		})
		if (!notification) return false

		await prisma.notifications.update({
			where: { id: notificationId },
			data: { read: true },
		})
		return true
	}

	async markAllRead(user_id: number) {
		const notifications = await prisma.notifications.findMany({
			where: {
				users: { some: { id: user_id } },
				read: false,
			},
			select: { id: true },
		})

		await prisma.notifications.updateMany({
			where: { id: { in: notifications.map((n) => n.id) } },
			data: { read: true },
		})

		return true
	}

	async deleteNotification(user_id: number, notificationId: number) {
		const notification = await prisma.notifications.findFirst({
			where: {
				id: notificationId,
				users: { some: { id: user_id } },
			},
		})
		if (!notification) return false

		await prisma.notifications.delete({
			where: { id: notificationId },
		})
		return true
	}

	async getStars(user_id: number, take: number, page: number) {
		const [stars, totalCount] = await Promise.all([
			prisma.star.findMany({
				where: { user_id },
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
			}),
			prisma.star.count({ where: { user_id } }),
		])

		const authorSelect = {
			id: true,
			name: true,
			username: true,
		} as const

		const starTargets: {
			type: string
			target_type: StarTargetType
			fetch: (ids: number[]) => Promise<
				{
					id: number
					external_id: string
					title: string
					author: AuthorPayload | null
					created_at: Date
				}[]
			>
			map: (item: {
				id: number
				external_id: string
				title: string
				author: AuthorPayload | null
				created_at: Date
			}) => StarItem
		}[] = [
			{
				type: 'build',
				target_type: StarTargetType.BUILD,
				fetch: (ids) =>
					prisma.build.findMany({
						where: { id: { in: ids } },
						include: { author: { select: authorSelect } },
					}),
				map: (item) => ({
					id: item.id,
					external_id: item.external_id,
					title: item.title,
					author: item.author,
					created_at: item.created_at,
				}),
			},
			{
				type: 'article',
				target_type: StarTargetType.ARTICLE,
				fetch: (ids) =>
					prisma.article.findMany({
						where: { id: { in: ids } },
						include: { author: { select: authorSelect } },
					}),
				map: (item) => ({
					id: item.id,
					external_id: item.external_id,
					title: item.title,
					author: item.author,
					created_at: item.created_at,
				}),
			},
			{
				type: 'art',
				target_type: StarTargetType.ART,
				fetch: (ids) =>
					prisma.art.findMany({
						where: { id: { in: ids } },
						include: { author: { select: authorSelect } },
					}),
				map: (item) => ({
					id: item.id,
					external_id: item.external_id,
					title: item.title,
					author: item.author,
					created_at: item.created_at,
				}),
			},
		]

		const maps = new Map<StarTargetType, Map<number, StarItem>>()
		await Promise.all(
			starTargets.map(async (t) => {
				const ids = stars
					.filter((s) => s.target_type === t.target_type)
					.map((s) => s.target_id)
				if (ids.length === 0) {
					maps.set(t.target_type, new Map())
					return
				}
				const items = await t.fetch(ids)
				maps.set(
					t.target_type,
					new Map(items.map((item) => [item.id, t.map(item)]))
				)
			})
		)

		const typeMap = new Map(starTargets.map((t) => [t.target_type, t.type]))

		const data = stars
			.map((s) => {
				const item = maps.get(s.target_type)?.get(s.target_id)
				const type = typeMap.get(s.target_type)
				return item && type ? { type, ...item } : null
			})
			.filter(Boolean)

		return { data, total_count: totalCount, page: page + 1, take }
	}

	async syncClans(user_id: number) {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
			include: { exbo_auth: true },
		})
		if (!user?.exbo_auth) {
			return { error: 'EXBO account is not linked' }
		}

		const region = user.exbo_auth.region
		if (!region) {
			return { error: 'Region is not set. Please set a region first.' }
		}

		const { access_token } = decryptSecretJson<{
			access_token: string
		}>(user.exbo_auth.token_blob)
		if (!access_token) {
			return { error: 'EXBO token is invalid' }
		}

		await clanService.detectFromExboCharacters(user_id, region, access_token)

		const profiles = await prisma.userClanProfile.findMany({
			where: { user_id },
			include: { clan: true },
			orderBy: { updated_at: 'desc' },
		})

		return { clans: profiles }
	}

	async getPublicProfile(username: string, viewerId?: number) {
		return this.getPublicProfileBy({ username }, viewerId)
	}

	async getPublicProfileById(user_id: number, viewerId?: number) {
		return this.getPublicProfileBy({ id: user_id }, viewerId)
	}

	private async getPublicProfileBy(
		where: Prisma.UserWhereInput,
		viewerId?: number
	) {
		const user = await prisma.user.findFirst({
			where,
			include: {
				user_settings: true,
				customization: {
					omit: {
						id: true,
						user_id: true,
						created_at: true,
						updated_at: true,
					},
				},
				badges: true,
				builds: {
					select: {
						id: true,
						title: true,
						tags: true,
						created_at: true,
						data: true,
					},
				},
				articles: {
					where: {
						status: 'APPROVED',
					},
					select: {
						id: true,
						type: true,
						title: true,
						image_url: true,
						tags: true,
						created_at: true,
					},
				},
				clan_profiles: {
					where: { is_active: true },
					include: { clan: true },
					take: 1,
				},
				clan_history: {
					orderBy: { seen_at: 'desc' },
					take: 20,
				},
			},
		})

		if (!user) return null

		const publicProfile = user.user_settings?.public_profile ?? false
		if (!publicProfile) return null

		const stars_count = await prisma.star.count({
			where: {
				OR: [
					{
						target_type: StarTargetType.BUILD,
						target_id: {
							in: (
								await prisma.build.findMany({
									where: { author_id: user.id },
									select: { id: true },
								})
							).map((b) => b.id),
						},
					},
					{
						target_type: StarTargetType.ARTICLE,
						target_id: {
							in: (
								await prisma.article.findMany({
									where: { author_id: user.id },
									select: { id: true },
								})
							).map((a) => a.id),
						},
					},
				],
			},
		})

		const buildIds = (user.builds ?? []).map((b) => b.id)
		const starredBuildIds =
			viewerId && buildIds.length
				? (
						await prisma.star.findMany({
							where: {
								user_id: viewerId,
								target_type: StarTargetType.BUILD,
								target_id: { in: buildIds },
							},
							select: { target_id: true },
						})
					).map((s) => s.target_id)
				: []
		const starredBuildSet = new Set(starredBuildIds)

		return {
			id: user.id,
			username: user.username,
			name: user.name,
			joined_at: user.joined_at,
			social_links: user.social_links ?? null,
			stars_count,
			badges: user.badges ?? [],
			builds: (user.builds ?? []).map((b) => ({
				...b,
				data: decompress(b.data),
				tags: b.tags ? b.tags.split(',').filter(Boolean) : [],
				is_starred: starredBuildSet.has(b.id),
			})),
			articles: user.articles ?? [],
			clan:
				user.clan_profiles?.[0]?.clan?.is_public === true
					? publicClanPayload(user.clan_profiles[0].clan)
					: null,
			clan_history: (user.clan_history ?? []).map((h) => ({
				id: h.id,
				player_name: h.player_name,
				region: h.region,
				clan_id: h.clan_id,
				clan_name: h.clan_name,
				clan_tag: h.clan_tag,
				alliance: h.alliance,
				rank: h.rank,
				joined_at: h.joined_at,
				seen_at: h.seen_at,
			})),
			customization: user.customization,
		}
	}
}

export const usersService = new UsersService()

function publicClanPayload(clan: {
	id: string
	name: string
	tag: string
	level: number
	level_points: number
	alliance: string
	description: string
	leader: string
	member_count: number
	region: string
	status: string
	is_public: boolean
	recruiting: boolean
	leader_discord: string
	clan_discord: string | null
	paid_recruitment: boolean
	rating: number
	tier: string
	guilds_per_week: number | null
	schedule: unknown
	created_at: Date
}) {
	return {
		id: clan.id,
		name: clan.name,
		tag: clan.tag,
		level: clan.level,
		level_points: clan.level_points,
		alliance: clan.alliance,
		description: clan.description,
		leader: clan.leader,
		member_count: clan.member_count,
		region: clan.region,
		status: clan.status,
		is_public: clan.is_public,
		recruiting: clan.recruiting,
		leader_discord: clan.leader_discord,
		clan_discord: clan.clan_discord,
		paid_recruitment: clan.paid_recruitment,
		rating: clan.rating,
		tier: clan.tier,
		guilds_per_week: clan.guilds_per_week,
		schedule: normalizeSchedule(clan.schedule),
		created_at: clan.created_at,
	}
}
