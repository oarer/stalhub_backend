import { AchievementRarity } from 'generated/prisma/enums'
import { prisma } from '@/lib/prisma'

type AchievementData = {
	slug?: string
	title?: string
	description?: string
	icon?: string
	rarity?: string
	hidden?: boolean
}

class AdminAchievementService {
	async list() {
		return prisma.achievement.findMany({
			include: {
				_count: {
					select: {
						users: true,
					},
				},
			},
		})
	}

	async get(achievementId: number) {
		const achievement = await prisma.achievement.findUnique({
			where: { id: achievementId },
			include: {
				users: {
					select: {
						user: {
							select: {
								id: true,
								username: true,
								name: true,
							},
						},
					},
				},
			},
		})

		if (!achievement) return null

		return {
			...achievement,
			users: achievement.users.map(({ user }) => user),
		}
	}

	async create(data: Required<Pick<AchievementData, 'slug' | 'title'>> & Omit<AchievementData, 'slug' | 'title'>) {
		const existing = await prisma.achievement.findUnique({
			where: { slug: data.slug },
		})
		if (existing) return { error: 'Achievement with this slug already exists' }

		const rarity = this.parseRarity(data.rarity)
		if (rarity === null) return { error: 'Invalid achievement rarity' }

		return prisma.achievement.create({
			data: {
				slug: data.slug,
				title: data.title,
				...(data.description !== undefined
					? { description: data.description }
					: {}),
				...(data.icon !== undefined ? { icon: data.icon } : {}),
				...(rarity !== undefined ? { rarity } : {}),
				...(data.hidden !== undefined ? { hidden: data.hidden } : {}),
			},
		})
	}

	async update(achievementId: number, data: AchievementData) {
		const existing = await prisma.achievement.findUnique({
			where: { id: achievementId },
		})
		if (!existing) return null

		if (data.slug !== undefined && data.slug !== existing.slug) {
			const slugTaken = await prisma.achievement.findUnique({
				where: { slug: data.slug },
			})
			if (slugTaken)
				return { error: 'Achievement with this slug already exists' }
		}

		const rarity = this.parseRarity(data.rarity)
		if (rarity === null) return { error: 'Invalid achievement rarity' }

		return prisma.achievement.update({
			where: { id: achievementId },
			data: {
				...(data.slug !== undefined ? { slug: data.slug } : {}),
				...(data.title !== undefined ? { title: data.title } : {}),
				...(data.description !== undefined
					? { description: data.description }
					: {}),
				...(data.icon !== undefined ? { icon: data.icon } : {}),
				...(rarity !== undefined ? { rarity } : {}),
				...(data.hidden !== undefined ? { hidden: data.hidden } : {}),
			},
		})
	}

	async remove(achievementId: number) {
		const existing = await prisma.achievement.findUnique({
			where: { id: achievementId },
		})
		if (!existing) return false

		await prisma.achievement.delete({ where: { id: achievementId } })
		return true
	}

	async assignToUser(userId: number, achievementId: number) {
		const [user, achievement] = await Promise.all([
			prisma.user.findUnique({ where: { id: userId } }),
			prisma.achievement.findUnique({ where: { id: achievementId } }),
		])
		if (!user || !achievement) return null

		const alreadyAssigned = await prisma.userAchievement.findFirst({
			where: { user_id: userId, achievement_id: achievementId },
		})
		if (alreadyAssigned) {
			return { error: 'User already has this achievement' }
		}

		await prisma.userAchievement.create({
			data: { user_id: userId, achievement_id: achievementId },
		})

		return this.getUserAchievements(userId)
	}

	async removeFromUser(userId: number, achievementId: number) {
		const user = await prisma.user.findUnique({ where: { id: userId } })
		if (!user) return null

		await prisma.userAchievement.deleteMany({
			where: { user_id: userId, achievement_id: achievementId },
		})

		return this.getUserAchievements(userId)
	}

	async getUserAchievements(userId: number) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: {
				achievements: {
					include: { achievement: true },
					orderBy: { unlocked_at: 'asc' },
				},
			},
		})

		if (!user) return null
		return user.achievements
	}

	private parseRarity(rarity?: string) {
		if (rarity === undefined) return undefined
		if (!Object.values(AchievementRarity).includes(rarity as AchievementRarity)) {
			return null
		}
		return rarity as AchievementRarity
	}
}

export const adminAchievementService = new AdminAchievementService()
