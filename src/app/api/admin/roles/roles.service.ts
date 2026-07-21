import { prisma } from '@/lib/prisma'

class RoleService {
	async list() {
		return prisma.role.findMany({
			orderBy: { id: 'asc' },
			include: {
				permissions: { select: { id: true, name: true } },
				_count: { select: { users: true } },
			},
		})
	}

	async create(name: string, description?: string, rank?: number) {
		return prisma.role.create({
			data: {
				name,
				description: description ?? '',
				...(rank !== undefined && { rank }),
			},
		})
	}

	async update(id: number, data: { name?: string; description?: string; rank?: number }) {
		const existing = await prisma.role.findUnique({ where: { id } })
		if (!existing) return null

		return prisma.role.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.description !== undefined && { description: data.description }),
				...(data.rank !== undefined && { rank: data.rank }),
			},
		})
	}

	async remove(id: number) {
		const existing = await prisma.role.findUnique({ where: { id } })
		if (!existing) return false

		await prisma.role.delete({ where: { id } })
		return true
	}

	async addPermissions(roleId: number, permissionIds: number[]) {
		const role = await prisma.role.findUnique({ where: { id: roleId } })
		if (!role) return null

		await prisma.role.update({
			where: { id: roleId },
			data: {
				permissions: {
					connect: permissionIds.map((id) => ({ id })),
				},
			},
		})

		return this.list().then((roles) => roles.find((r) => r.id === roleId))
	}

	async removePermissions(roleId: number, permissionIds: number[]) {
		const role = await prisma.role.findUnique({ where: { id: roleId } })
		if (!role) return null

		await prisma.role.update({
			where: { id: roleId },
			data: {
				permissions: {
					disconnect: permissionIds.map((id) => ({ id })),
				},
			},
		})

		return this.list().then((roles) => roles.find((r) => r.id === roleId))
	}
}

export const roleService = new RoleService()
