import { prisma } from '@/lib/prisma'

class AdminUserService {
	async getUserMaxRank(userId: number): Promise<number> {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: { roles: { select: { rank: true } } },
		})
		if (!user || user.roles.length === 0) return 0
		return Math.max(...user.roles.map((r) => r.rank))
	}

	async canManageUser(
		actorUserId: number,
		targetUserId: number
	): Promise<boolean> {
		const [actorRank, targetRank] = await Promise.all([
			this.getUserMaxRank(actorUserId),
			this.getUserMaxRank(targetUserId),
		])
		return actorRank > targetRank
	}

	async list(take: number, page: number, search?: string) {
		const where = search
			? {
					OR: [
						{
							username: {
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
					roles: true,
					sessions: true,
					_count: {
						select: {
							sessions: true,
							builds: true,
							articles: true,
						},
					},
				},
			}),
			prisma.user.count({ where }),
		])

		return { data, totalCount }
	}

	async get(userId: number) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: {
				UserSettings: true,
				DiscordAuth: true,
				TelegramAuth: true,
				EXBOAuth: true,
				badges: true,
				roles: {
					include: {
						permissions: { select: { id: true, name: true } },
					},
				},
				_count: {
					select: {
						sessions: true,
						builds: true,
						articles: true,
						stars: true,
					},
				},
			},
		})

		if (!user) return null
		return user
	}

	async update(userId: number, data: { username?: string; name?: string }) {
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

	async remove(userId: number) {
		const existing = await prisma.user.findUnique({ where: { id: userId } })
		if (!existing) return false

		await prisma.user.delete({ where: { id: userId } })
		return true
	}

	async getSessions(userId: number) {
		return prisma.sessions.findMany({
			where: { userId },
			orderBy: { last_used_at: 'desc' },
			select: {
				id: true,
				sessionId: true,
				User_Agent: true,
				ip: true,
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

	async getUserRoles(userId: number) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: { roles: true },
		})

		if (!user) return null

		return user?.roles ?? null
	}

	async assignRole(userId: number, roleId: number) {
		const [user, role] = await Promise.all([
			prisma.user.findUnique({ where: { id: userId } }),
			prisma.role.findUnique({ where: { id: roleId } }),
		])

		if (!user || !role) return null

		await prisma.user.update({
			where: { id: userId },
			data: { roles: { connect: { id: roleId } } },
		})

		return this.getUserRoles(userId)
	}

	async unassignRole(userId: number, roleId: number) {
		await prisma.user.update({
			where: { id: userId },
			data: { roles: { disconnect: { id: roleId } } },
		})

		return this.getUserRoles(userId)
	}

	async ban(userId: number, reason?: string, expiresAt?: Date) {
		const existing = await prisma.user.findUnique({ where: { id: userId } })
		if (!existing) return null

		await prisma.userSettings.upsert({
			where: { userId },
			update: {
				banned: true,
				ban_reason: reason ?? null,
				ban_expires_at: expiresAt ?? null,
			},
			create: {
				userId,
				banned: true,
				ban_reason: reason ?? null,
				ban_expires_at: expiresAt ?? null,
			},
		})

		await prisma.sessions.updateMany({
			where: { userId },
			data: { revoked: true },
		})

		return this.get(userId)
	}

	async unban(userId: number) {
		const existing = await prisma.user.findUnique({ where: { id: userId } })
		if (!existing) return null

		await prisma.userSettings.update({
			where: { userId },
			data: {
				banned: false,
				ban_reason: null,
				ban_expires_at: null,
			},
		})

		return this.get(userId)
	}
}

export const adminUserService = new AdminUserService()
