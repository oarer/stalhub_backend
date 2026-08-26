import { usersService } from '@/app/api/users/users.service'
import { prisma } from '@/lib/prisma'

class AdminUserService {
	async updateCustomization(
		user_id: number,
		data: {
			banner_mode?: 'COLOR' | 'IMAGE' | 'NONE'
			banner_type?: 'BACKGROUND' | 'HEADER'
			banner_color?: string
			banner_image?: string | null
		}
	) {
		const existing = await prisma.user.findUnique({ where: { id: user_id } })
		if (!existing) return null

		const updateData: Record<string, unknown> = {}
		if (data.banner_mode !== undefined)
			updateData.banner_mode = data.banner_mode
		if (data.banner_type !== undefined)
			updateData.banner_type = data.banner_type
		if (data.banner_color !== undefined)
			updateData.banner_color = data.banner_color
		if (data.banner_image !== undefined)
			updateData.banner_image = data.banner_image

		if (Object.keys(updateData).length === 0) {
			return { error: 'No valid fields to update' }
		}

		return prisma.userCustomization.upsert({
			where: { user_id },
			update: updateData,
			create: { user_id, ...updateData },
		})
	}

	async saveBanner(
		user_id: number,
		file: { name: string; type: string; buffer: Buffer }
	) {
		const existing = await prisma.user.findUnique({ where: { id: user_id } })
		if (!existing) return null

		return usersService.saveBanner(user_id, file)
	}

	async getUserMaxRank(user_id: number): Promise<number> {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
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

		return { data, total_count: totalCount, page: page + 1, take }
	}

	async get(user_id: number) {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
			include: {
				user_settings: true,
				customization: true,
				discord_auth: true,
				telegram_auth: true,
				exbo_auth: true,
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

	async update(user_id: number, data: { username?: string; name?: string }) {
		const existing = await prisma.user.findUnique({ where: { id: user_id } })
		if (!existing) return null

		if (data.username) {
			const taken = await prisma.user.findFirst({
				where: { username: data.username, id: { not: user_id } },
			})
			if (taken) return { error: 'Username already taken' }
		}

		return prisma.user.update({
			where: { id: user_id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.username !== undefined && { username: data.username }),
			},
		})
	}

	async remove(user_id: number) {
		const existing = await prisma.user.findUnique({ where: { id: user_id } })
		if (!existing) return false

		await prisma.user.delete({ where: { id: user_id } })
		return true
	}

	async getSessions(user_id: number) {
		return prisma.sessions.findMany({
			where: { user_id },
			orderBy: { last_used_at: 'desc' },
			select: {
				id: true,
				session_id: true,
				user_agent: true,
				ip: true,
				last_used_at: true,
				revoked: true,
			},
		})
	}

	async revokeSession(session_id: string) {
		await prisma.sessions.updateMany({
			where: { session_id },
			data: { revoked: true },
		})
	}

	async getUserRoles(user_id: number) {
		const user = await prisma.user.findUnique({
			where: { id: user_id },
			include: { roles: true },
		})

		if (!user) return null

		return user?.roles ?? null
	}

	async assignRole(user_id: number, role_id: number) {
		const [user, role] = await Promise.all([
			prisma.user.findUnique({ where: { id: user_id } }),
			prisma.role.findUnique({ where: { id: role_id } }),
		])

		if (!user || !role) return null

		await prisma.user.update({
			where: { id: user_id },
			data: { roles: { connect: { id: role_id } } },
		})

		return this.getUserRoles(user_id)
	}

	async unassignRole(user_id: number, role_id: number) {
		await prisma.user.update({
			where: { id: user_id },
			data: { roles: { disconnect: { id: role_id } } },
		})

		return this.getUserRoles(user_id)
	}

	async ban(user_id: number, reason?: string, expiresAt?: Date) {
		const existing = await prisma.user.findUnique({ where: { id: user_id } })
		if (!existing) return null

		await prisma.userSettings.upsert({
			where: { user_id },
			update: {
				banned: true,
				ban_reason: reason ?? null,
				ban_expires_at: expiresAt ?? null,
			},
			create: {
				user_id,
				banned: true,
				ban_reason: reason ?? null,
				ban_expires_at: expiresAt ?? null,
			},
		})

		await prisma.sessions.updateMany({
			where: { user_id },
			data: { revoked: true },
		})

		return this.get(user_id)
	}

	async deleteBuilds(user_id: number) {
		const existing = await prisma.user.findUnique({ where: { id: user_id } })
		if (!existing) return null

		const buildIds = await prisma.build.findMany({
			where: { author_id: user_id },
			select: { id: true },
		})
		const ids = buildIds.map((b) => b.id)

		if (ids.length > 0) {
			await prisma.star.deleteMany({
				where: { target_type: 'BUILD', target_id: { in: ids } },
			})
		}

		const { count } = await prisma.build.deleteMany({
			where: { author_id: user_id },
		})
		return { deleted: count }
	}

	async unban(user_id: number) {
		const existing = await prisma.user.findUnique({ where: { id: user_id } })
		if (!existing) return null

		await prisma.userSettings.update({
			where: { user_id },
			data: {
				banned: false,
				ban_reason: null,
				ban_expires_at: null,
			},
		})

		return this.get(user_id)
	}
}

export const adminUserService = new AdminUserService()
