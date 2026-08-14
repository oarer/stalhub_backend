import { prisma } from '@/lib/prisma'

class BadgesService {
	async list() {
		return prisma.userBadges.findMany({
			include: {
				_count: {
					select: {
						users: true,
					},
				},
			},
		})
	}

	async get(badgeId: number) {
		return prisma.userBadges.findUnique({
			where: { id: badgeId },
			include: {
				users: {
					select: {
						id: true,
						username: true,
						name: true,
					},
				},
			},
		})
	}

	async create(name: string, icon?: string, color?: string, image?: string) {
		const existing = await prisma.userBadges.findFirst({
			where: { name },
		})

		if (existing) {
			return { error: 'Badge with this name already exists' }
		}

		return prisma.userBadges.create({
			data: {
				name,
				icon: image ? null : (icon ?? undefined),
				...(color ? { color } : {}),
				...(image ? { image } : {}),
			},
		})
	}

	async update(
		badgeId: number,
		data: {
			name?: string
			icon?: string
			color?: string
			image?: string | null
		}
	) {
		const existing = await prisma.userBadges.findUnique({
			where: { id: badgeId },
		})

		if (!existing) return null

		if (data.name) {
			const nameTaken = await prisma.userBadges.findFirst({
				where: { name: data.name, id: { not: badgeId } },
			})
			if (nameTaken)
				return { error: 'Badge with this name already exists' }
		}

		return prisma.userBadges.update({
			where: { id: badgeId },
			data: {
				...(data.name !== undefined ? { name: data.name } : {}),
				...(data.icon !== undefined ? { icon: data.icon } : {}),
				...(data.image !== undefined ? { image: data.image } : {}),
				...(data.color !== undefined ? { color: data.color } : {}),
			},
		})
	}

	async remove(badgeId: number) {
		const existing = await prisma.userBadges.findUnique({
			where: { id: badgeId },
		})

		if (!existing) return false

		await prisma.userBadges.delete({
			where: { id: badgeId },
		})

		return true
	}

	async assignToUser(userId: number, badgeId: number) {
		const [user, badge] = await Promise.all([
			prisma.user.findUnique({ where: { id: userId } }),
			prisma.userBadges.findUnique({ where: { id: badgeId } }),
		])

		if (!user || !badge) return null

		const userBadges = await prisma.user.findUnique({
			where: { id: userId },
			include: { badges: true },
		})

		const alreadyAssigned = userBadges?.badges.some((b) => b.id === badgeId)

		if (alreadyAssigned) {
			return { error: 'User already has this badge' }
		}

		await prisma.user.update({
			where: { id: userId },
			data: { badges: { connect: { id: badgeId } } },
		})

		return this.getUserBadges(userId)
	}

	async removeFromUser(userId: number, badgeId: number) {
		const user = await prisma.user.findUnique({ where: { id: userId } })
		if (!user) return null

		await prisma.user.update({
			where: { id: userId },
			data: { badges: { disconnect: { id: badgeId } } },
		})

		return this.getUserBadges(userId)
	}

	async getUserBadges(userId: number) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: { badges: true },
		})

		if (!user) return null

		return user.badges
	}
}

export const badgesService = new BadgesService()
