import { prisma } from '@/lib/prisma'

class PermissionService {
	async list() {
		return prisma.permission.findMany({
			orderBy: { id: 'asc' },
			include: { roles: { select: { id: true, name: true } } },
		})
	}

	async create(name: string, description?: string, role_id?: number) {
		return prisma.permission.create({
			data: {
				name,
				description: description ?? '',
				...(role_id !== undefined && { role_id }),
			},
		})
	}

	async update(
		id: number,
		data: { name?: string; description?: string; role_id?: number | null }
	) {
		const existing = await prisma.permission.findUnique({ where: { id } })
		if (!existing) return null

		return prisma.permission.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.description !== undefined && {
					description: data.description,
				}),
				...(data.role_id !== undefined && { role_id: data.role_id }),
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
