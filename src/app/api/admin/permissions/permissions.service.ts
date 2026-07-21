import { prisma } from '@/lib/prisma'

class PermissionService {
	async list() {
		return prisma.permission.findMany({
			orderBy: { id: 'asc' },
			include: { roles: { select: { id: true, name: true } } },
		})
	}

	async create(name: string, description?: string, roleId?: number) {
		return prisma.permission.create({
			data: {
				name,
				description: description ?? '',
				...(roleId !== undefined && { roleId }),
			},
		})
	}

	async update(
		id: number,
		data: { name?: string; description?: string; roleId?: number | null }
	) {
		const existing = await prisma.permission.findUnique({ where: { id } })
		if (!existing) return null

		return prisma.permission.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.description !== undefined && { description: data.description }),
				...(data.roleId !== undefined && { roleId: data.roleId }),
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
