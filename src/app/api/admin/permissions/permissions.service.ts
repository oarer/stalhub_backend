import { prisma } from '@/lib/prisma'

class PermissionService {
	async list() {
		return prisma.permission.findMany({ orderBy: { id: 'asc' } })
	}

	async create(name: string, description?: string) {
		return prisma.permission.create({ data: { name, description: description ?? '' } })
	}

	async update(id: number, data: { name?: string; description?: string }) {
		const existing = await prisma.permission.findUnique({ where: { id } })
		if (!existing) return null

		return prisma.permission.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.description !== undefined && { description: data.description }),
			},
		})
	}

	async remove(id: number) {
		const existing = await prisma.permission.findUnique({ where: { id } })
		if (!existing) return false

		await prisma.permission.delete({ where: { id } })
		return true
	}
}

export const permissionService = new PermissionService()
