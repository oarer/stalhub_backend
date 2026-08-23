import { prisma } from '@/lib/prisma'

class LoadoutService {
	async get(user_id: number) {
		return prisma.userLoadout.findUnique({ where: { user_id } })
	}

	async getMany(user_ids: number[]) {
		if (user_ids.length === 0) return []
		return prisma.userLoadout.findMany({
			where: { user_id: { in: user_ids }, is_public: true },
		})
	}

	async upsert(user_id: number, data: unknown, isPublic: boolean) {
		return prisma.userLoadout.upsert({
			where: { user_id },
			create: { user_id, data: data as never, is_public: isPublic },
			update: { data: data as never, is_public: isPublic },
		})
	}
}
export const loadoutService = new LoadoutService()
