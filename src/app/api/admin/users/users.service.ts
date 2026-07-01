import { prisma } from '@/lib/prisma'

class AdminUserService {
	async list(take: number, page: number, search?: string) {
		const where = search
			? {
				OR: [
					{ id: { contains: search, mode: 'insensitive' as const } },
					{ username: { contains: search, mode: 'insensitive' as const } },
					{ name: { contains: search, mode: 'insensitive' as const } },
				],
			}
			: {}

		const [data, totalCount] = await Promise.all([
			prisma.user.findMany({
				where,
				skip: page * take,
				take,
				orderBy: { joined_at: 'desc' },
				select: {
					id: true,
					username: true,
					name: true,
					joined_at: true,
					_count: { select: { sessions: true, builds: true, articles: true } },
				},
			}),
			prisma.user.count({ where }),
		])

		return { data, totalCount }
	}

	async get(userId: string) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: {
				UserSettings: true,
				DiscordAuth: true,
				TelegramAuth: true,
				EXBOAuth: true,
				badges: true,
				roles: {
					include: { role: { include: { permissions: { include: { permission: true } } } } },
				},
				_count: { select: { sessions: true, builds: true, articles: true, stars: true } },
			},
		})

		if (!user) return null
		return user
	}

	async update(userId: string, data: { username?: string; name?: string }) {
		const existing = await prisma.user.findUnique({ where: { id: userId } })
		if (!existing) return null

		if (data.username) {
			const taken = await prisma.user.findFirst({
				where: { username: data.username, id: { not: userId } },
			})
			if (taken) return { error: 'Username already taken' }
		}

		return prisma.user.update({
			where: { id: userId },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.username !== undefined && { username: data.username }),
			},
		})
	}

	async remove(userId: string) {
		const existing = await prisma.user.findUnique({ where: { id: userId } })
		if (!existing) return false

		await prisma.user.delete({ where: { id: userId } })
		return true
	}

	async getSessions(userId: string) {
		return prisma.sessions.findMany({
			where: { userId },
			orderBy: { last_used_at: 'desc' },
			select: {
				id: true,
				sessionId: true,
				User_Agent: true,
				last_used_at: true,
				revoked: true,
			},
		})
	}

	async revokeSession(sessionId: string) {
		await prisma.sessions.updateMany({
			where: { sessionId },
			data: { revoked: true },
		})
	}

	async getUserRoles(userId: string) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: {
				roles: {
					include: { role: true },
				},
			},
		})

		if (!user) return null

		return {
			userID: user.id,
			roles: user.roles.map((ur) => ur.role),
		}
	}

	async assignRole(userId: string, roleId: number) {
		const [user, role] = await Promise.all([
			prisma.user.findUnique({ where: { id: userId } }),
			prisma.role.findUnique({ where: { id: roleId } }),
		])

		if (!user || !role) return null

		await prisma.userRole.upsert({
			where: { userId_roleId: { userId, roleId } },
			create: { userId, roleId },
			update: {},
		})

		return this.getUserRoles(userId)
	}

	async unassignRole(userId: string, roleId: number) {
		await prisma.userRole.deleteMany({
			where: { userId, roleId },
		})

		return this.getUserRoles(userId)
	}
}

export const adminUserService = new AdminUserService()
