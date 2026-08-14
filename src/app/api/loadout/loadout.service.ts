import { prisma } from '@/lib/prisma'

class LoadoutService {
	async get(userId: number) {
		return prisma.userLoadout.findUnique({ where: { userId } })
	}

	async getMany(userIds: number[]) {
		if (userIds.length === 0) return []
		return prisma.userLoadout.findMany({
			where: { userId: { in: userIds }, is_public: true },
		})
	}

	async upsert(userId: number, data: unknown, isPublic: boolean) {
		return prisma.userLoadout.upsert({
			where: { userId },
			create: { userId, data: data as never, is_public: isPublic },
			update: { data: data as never, is_public: isPublic },
		})
	}
}
export const loadoutService = new LoadoutService()
