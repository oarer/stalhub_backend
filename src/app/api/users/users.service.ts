import {
	type AvatarSource,
	type BgVariant,
	StarTargetType,
} from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { authService } from '@/utils/auth.service'

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

class UsersService {
	async getMe(sessionId: string) {
		const session = await authService.getSession(sessionId)
		return authService.userPayload(session!)
	}

	async updateSettings(
		userId: number,
		data: {
			public_profile?: boolean
			avatar?: AvatarSource
			name?: string
			bg_variant?: BgVariant
			bg_color?: string
		}
	) {
		if (Object.keys(data).length === 0) {
			return { error: 'No valid fields to update' }
		}

		return prisma.userSettings.upsert({
			where: { userId },
			update: data,
			create: {
				userId,
				...data,
			},
		})
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
				current: user.UserSettings?.avatar?.toLowerCase() ?? 'discord',
				available,
			},
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

		const buildIds = stars
			.filter((s) => s.targetType === StarTargetType.BUILD)
			.map((s) => s.targetId)
		const articleIds = stars
			.filter((s) => s.targetType === StarTargetType.ARTICLE)
			.map((s) => s.targetId)

		const [builds, articles] = await Promise.all([
			buildIds.length
				? prisma.build.findMany({
						where: { id: { in: buildIds } },
						include: {
							author: {
								select: {
									id: true,
									name: true,
									username: true,
								},
							},
						},
					})
				: Promise.resolve([]),
			articleIds.length
				? prisma.article.findMany({
						where: { id: { in: articleIds } },
						include: {
							author: {
								select: {
									id: true,
									name: true,
									username: true,
								},
							},
						},
					})
				: Promise.resolve([]),
		])

		const buildMap = new Map(builds.map((b) => [b.id, b]))
		const articleMap = new Map(articles.map((a) => [a.id, a]))

		const data = stars
			.map((s) => {
				if (s.targetType === StarTargetType.BUILD) {
					const b = buildMap.get(s.targetId)
					return b
						? {
								type: 'build' as const,
								id: b.id,
								external_id: b.external_id,
								title: b.title,
								author: b.author,
								created_at: b.created_at,
							}
						: null
				}

				const a = articleMap.get(s.targetId)
				return a
					? {
							type: 'article' as const,
							id: a.id,
							external_id: a.external_id,
							title: a.title,
							author: a.author,
							created_at: a.created_at,
						}
					: null
			})
			.filter(Boolean)

		return { data, totalCount }
	}

	async getPublicProfile(username: string, currentUserId?: number) {
		const user = await prisma.user.findFirst({
			where: { username },
			include: {
				UserSettings: true,
				badges: true,
			},
		})

		if (!user) return null

		if (currentUserId && user.id === currentUserId) {
			return { is_self: true }
		}

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

		return {
			userID: user.id,
			username: user.username,
			name: user.name,
			joined_at: user.joined_at,
			stars_count,
			badges: user.badges?.length ?? 0,
		}
	}
}

export const usersService = new UsersService()
