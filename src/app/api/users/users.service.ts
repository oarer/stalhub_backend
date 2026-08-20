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
		userId: number,
		file: { name: string; type: string; buffer: Buffer }
	) {
		const bannerDir = './uploads/users/banners'
		await mkdir(bannerDir, { recursive: true })

		const existing = await prisma.userCustomization.findUnique({
			where: { userId },
			select: { bannerImage: true },
		})
		const oldPath = existing?.bannerImage
		if (
			oldPath &&
			oldPath.startsWith('/uploads/users/banners/') &&
			!oldPath.includes('..')
		) {
			await rm(path.join('.', oldPath), { force: true }).catch(() => {})
		}

		const ext = path.extname(file.name) || '.png'
		const filename = `${userId}-${randomUUID()}${ext}`
		const fullPath = path.join(bannerDir, filename)
		await writeFile(fullPath, file.buffer)

		const bannerImage = `/uploads/users/banners/${filename}`
		await prisma.userCustomization.upsert({
			where: { userId },
			update: { bannerImage, bannerMode: 'IMAGE' },
			create: { userId, bannerImage, bannerMode: 'IMAGE' },
		})

		return { banner_image: bannerImage }
	}

	async saveAvatar(
		userId: number,
		file: { name: string; type: string; buffer: Buffer }
	) {
		const avatarDir = './uploads/users/avatars'
		await mkdir(avatarDir, { recursive: true })

		const existing = await prisma.userCustomization.findUnique({
			where: { userId },
			select: { avatarImage: true },
		})
		const oldPath = existing?.avatarImage
		if (
			oldPath &&
			oldPath.startsWith('/uploads/users/avatars/') &&
			!oldPath.includes('..')
		) {
			await rm(path.join('.', oldPath), { force: true }).catch(() => {})
		}

		const ext = path.extname(file.name) || '.png'
		const filename = `${userId}-${randomUUID()}${ext}`
		const fullPath = path.join(avatarDir, filename)
		await writeFile(fullPath, file.buffer)

		const avatarImage = `/uploads/users/avatars/${filename}`
		await prisma.userCustomization.upsert({
			where: { userId },
			update: { avatarImage },
			create: { userId, avatarImage },
		})

		return { avatar_image: avatarImage }
	}

	async clearAvatar(userId: number) {
		const existing = await prisma.userCustomization.findUnique({
			where: { userId },
			select: { avatarImage: true },
		})
		const oldPath = existing?.avatarImage
		if (
			oldPath &&
			oldPath.startsWith('/uploads/users/avatars/') &&
			!oldPath.includes('..')
		) {
			await rm(path.join('.', oldPath), { force: true }).catch(() => {})
		}

		await prisma.userCustomization.updateMany({
			where: { userId },
			data: { avatarImage: null },
		})

		return { ok: true }
	}

	async getMe(sessionId: string) {
		const session = await authService.getSession(sessionId)
		return authService.userPayload(session!)
	}

	async updateSettings(
		userId: number,
		data: {
			public_profile?: boolean
			layout?: UserLayout

			bannerMode?: BannerMode
			bannerType?: BannerType
			bannerColor?: string
			bannerImage?: string

			cardBackground?: CardBackground
			cardColor?: string
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
						where: { userId },
						update: { public_profile },
						create: { userId, public_profile },
					})
				: Promise.resolve(null),
			Object.keys(customization).length > 0
				? prisma.userCustomization.upsert({
						where: { userId },
						update: customization,
						create: { userId, ...customization },
					})
				: Promise.resolve(null),
		])

		if (region) {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				include: { EXBOAuth: true },
			})

			if (user?.EXBOAuth) {
				await prisma.eXBOAuth.update({
					where: { id: user.EXBOAuth.id },
					data: { region, region_changed_at: new Date() },
				})

				try {
					const { access_token } = decryptSecretJson<{
						access_token: string
					}>(user.EXBOAuth.token_blob)
					if (access_token) {
						await clanService.detectFromExboCharacters(
							userId,
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
		userId: number,
		socialLinks: Record<string, string>
	) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
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
			where: { id: userId },
			data: { social_links: pruned },
		})

		return { success: true }
	}

	async updateProfile(
		userId: number,
		data: {
			name?: string
			username?: string
		}
	) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
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
			where: { id: userId },
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
		userId: number,
		data: {
			name?: string
			username?: string
			region?: string
			layout?: UserLayout
			bannerMode?: BannerMode
			bannerType?: BannerType
			bannerColor?: string
			bannerImage?: string
			cardBackground?: CardBackground
			cardColor?: string
		}
	) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: { EXBOAuth: true },
		})
		if (!user) return { error: 'User not found' }

		if (data.username) {
			const existing = await prisma.user.findUnique({
				where: { username: data.username },
				select: { id: true },
			})
			if (existing && existing.id !== userId) {
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
		if (data.bannerMode) customization.bannerMode = data.bannerMode
		if (data.bannerType) customization.bannerType = data.bannerType
		if (data.bannerColor) customization.bannerColor = data.bannerColor
		if (data.bannerImage) customization.bannerImage = data.bannerImage
		if (data.cardBackground)
			customization.cardBackground = data.cardBackground
		if (data.cardColor) customization.cardColor = data.cardColor

		await Promise.all([
			prisma.user.update({ where: { id: userId }, data: userUpdate }),
			Object.keys(customization).length > 0
				? prisma.userCustomization.upsert({
						where: { userId },
						update: customization,
						create: { userId, ...customization },
					})
				: Promise.resolve(null),
			user.EXBOAuth && data.region
				? prisma.eXBOAuth.update({
						where: { id: user.EXBOAuth.id },
						data: {
							region: data.region,
							region_changed_at: new Date(),
						},
					})
				: Promise.resolve(null),
		])

		if (user.EXBOAuth && data.region) {
			try {
				const { access_token } = decryptSecretJson<{
					access_token: string
				}>(user.EXBOAuth.token_blob)
				if (access_token) {
					await clanService.detectFromExboCharacters(
						userId,
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

	async revokeSession(sessionId: string) {
		await authService.revokeSession(sessionId)
	}

	async deleteAccount(userId: number) {
		await prisma.user.delete({ where: { id: userId } })
	}

	async getSessions(userId: number, currentSessionId: string) {
		const sessions = await prisma.sessions.findMany({
			where: { userId, revoked: false },
			orderBy: { last_used_at: 'desc' },
		})

		return sessions.map((s) => {
			const info = parseUserAgent(s.User_Agent)
			return {
				id: s.id,
				last_accessed: s.last_used_at,
				is_self: s.sessionId === currentSessionId,
				is_mobile: info.isMobile,
				browser: info.browser,
				browser_version: info.browserVersion,
				ip: s.ip,
			}
		})
	}

	async revokeAllSessions(userId: number, currentSessionId: string) {
		await prisma.sessions.updateMany({
			where: {
				userId,
				sessionId: { not: currentSessionId },
				revoked: false,
			},
			data: { revoked: true },
		})
	}

	async revokeSessionById(id: number, userId: number) {
		await prisma.sessions.updateMany({
			where: { id, userId, revoked: false },
			data: { revoked: true },
		})
	}

	async getSettings(userId: number) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: {
				UserSettings: true,
				customization: true,
				DiscordAuth: true,
				TelegramAuth: true,
				EXBOAuth: true,
			},
		})

		if (!user) return null

		const available: string[] = []
		if (user.DiscordAuth) available.push('discord')
		if (user.TelegramAuth) available.push('telegram')
		if (user.EXBOAuth) available.push('exbo')

		const worksCount = 0

		return {
			userID: user.id,
			public_profile: user.UserSettings?.public_profile ?? false,
			can_be_public: worksCount > 0,
			avatar: {
				current: user.customization?.avatar?.toLowerCase() ?? 'discord',
				available,
			},
			avatar_image: user.customization?.avatarImage ?? null,
			region: user.EXBOAuth?.region ?? null,
			region_changed_at: user.EXBOAuth?.region_changed_at ?? null,
		}
	}

	async getNotifications(userId: number, take: number, page: number) {
		const [data, totalCount] = await Promise.all([
			prisma.notifications.findMany({
				where: { users: { some: { id: userId } } },
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
			}),
			prisma.notifications.count({
				where: { users: { some: { id: userId } } },
			}),
		])

		return { data, totalCount }
	}

	async getUnreadCount(userId: number) {
		return prisma.notifications.count({
			where: {
				users: { some: { id: userId } },
				read: false,
			},
		})
	}

	async markRead(userId: number, notificationId: number) {
		const notification = await prisma.notifications.findFirst({
			where: {
				id: notificationId,
				users: { some: { id: userId } },
			},
		})
		if (!notification) return false

		await prisma.notifications.update({
			where: { id: notificationId },
			data: { read: true },
		})
		return true
	}

	async markAllRead(userId: number) {
		const notifications = await prisma.notifications.findMany({
			where: {
				users: { some: { id: userId } },
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

	async deleteNotification(userId: number, notificationId: number) {
		const notification = await prisma.notifications.findFirst({
			where: {
				id: notificationId,
				users: { some: { id: userId } },
			},
		})
		if (!notification) return false

		await prisma.notifications.delete({
			where: { id: notificationId },
		})
		return true
	}

	async getStars(userId: number, take: number, page: number) {
		const [stars, totalCount] = await Promise.all([
			prisma.star.findMany({
				where: { userId },
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
			}),
			prisma.star.count({ where: { userId } }),
		])

		const authorSelect = {
			id: true,
			name: true,
			username: true,
		} as const

		const starTargets: {
			type: string
			targetType: StarTargetType
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
				targetType: StarTargetType.BUILD,
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
				targetType: StarTargetType.ARTICLE,
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
				targetType: StarTargetType.ART,
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
					.filter((s) => s.targetType === t.targetType)
					.map((s) => s.targetId)
				if (ids.length === 0) {
					maps.set(t.targetType, new Map())
					return
				}
				const items = await t.fetch(ids)
				maps.set(
					t.targetType,
					new Map(items.map((item) => [item.id, t.map(item)]))
				)
			})
		)

		const typeMap = new Map(starTargets.map((t) => [t.targetType, t.type]))

		const data = stars
			.map((s) => {
				const item = maps.get(s.targetType)?.get(s.targetId)
				const type = typeMap.get(s.targetType)
				return item && type ? { type, ...item } : null
			})
			.filter(Boolean)

		return { data, totalCount }
	}

	async syncClans(userId: number) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: { EXBOAuth: true },
		})
		if (!user?.EXBOAuth) {
			return { error: 'EXBO account is not linked' }
		}

		const region = user.EXBOAuth.region
		if (!region) {
			return { error: 'Region is not set. Please set a region first.' }
		}

		const { access_token } = decryptSecretJson<{
			access_token: string
		}>(user.EXBOAuth.token_blob)
		if (!access_token) {
			return { error: 'EXBO token is invalid' }
		}

		await clanService.detectFromExboCharacters(userId, region, access_token)

		const profiles = await prisma.userClanProfile.findMany({
			where: { userId },
			include: { clan: true },
			orderBy: { updated_at: 'desc' },
		})

		return { clans: profiles }
	}

	async getPublicProfile(username: string, viewerId?: number) {
		return this.getPublicProfileBy({ username }, viewerId)
	}

	async getPublicProfileById(userId: number, viewerId?: number) {
		return this.getPublicProfileBy({ id: userId }, viewerId)
	}

	private async getPublicProfileBy(
		where: Prisma.UserWhereInput,
		viewerId?: number
	) {
		const user = await prisma.user.findFirst({
			where,
			include: {
				UserSettings: true,
				customization: {
					omit: {
						id: true,
						userId: true,
						createdAt: true,
						updatedAt: true,
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
				clanProfiles: {
					where: { isActive: true },
					include: { clan: true },
					take: 1,
				},
				clanHistory: {
					orderBy: { seen_at: 'desc' },
					take: 20,
				},
			},
		})

		if (!user) return null

		const publicProfile = user.UserSettings?.public_profile ?? false
		if (!publicProfile) return null

		const stars_count = await prisma.star.count({
			where: {
				OR: [
					{
						targetType: StarTargetType.BUILD,
						targetId: {
							in: (
								await prisma.build.findMany({
									where: { authorId: user.id },
									select: { id: true },
								})
							).map((b) => b.id),
						},
					},
					{
						targetType: StarTargetType.ARTICLE,
						targetId: {
							in: (
								await prisma.article.findMany({
									where: { authorId: user.id },
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
								userId: viewerId,
								targetType: StarTargetType.BUILD,
								targetId: { in: buildIds },
							},
							select: { targetId: true },
						})
					).map((s) => s.targetId)
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
				user.clanProfiles?.[0]?.clan?.is_public === true
					? publicClanPayload(user.clanProfiles[0].clan)
					: null,
			clan_history: (user.clanHistory ?? []).map((h) => ({
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
		schedule: normalizeSchedule(clan.schedule),
		created_at: clan.created_at,
	}
}
