import { prisma } from '@/lib/prisma'

class AchievementService {
	async listDefinitions() {
		return prisma.achievement.findMany({
			where: { hidden: false },
			orderBy: { created_at: 'asc' },
			select: {
				id: true,
				slug: true,
				title: true,
				description: true,
				icon: true,
				rarity: true,
				hidden: true,
			},
		})
	}

	async getUserAchievements(userId: number) {
		return prisma.userAchievement.findMany({
			where: { user_id: userId },
			orderBy: { unlocked_at: 'asc' },
			select: {
				id: true,
				achievement_id: true,
				unlocked_at: true,
				achievement: {
					select: {
						id: true,
						slug: true,
						title: true,
						description: true,
						icon: true,
						rarity: true,
						hidden: true,
					},
				},
			},
		})
	}

	async getMyAchievements(userId: number) {
		return this.getUserAchievements(userId)
	}
}

export const achievementService = new AchievementService()
