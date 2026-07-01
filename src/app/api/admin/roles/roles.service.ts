import { prisma } from '@/lib/prisma'

class RoleService {
	async list() {
		return prisma.role.findMany({
			orderBy: { id: 'asc' },
			include: {
				permissions: {
					include: { permission: { select: { id: true, name: true } } },
				},
				_count: { select: { users: true } },
			},
		})
	}

	async create(name: string, description?: string) {
		return prisma.role.create({ data: { name, description: description ?? '' } })
	}

	async update(id: number, data: { name?: string; description?: string }) {
		const existing = await prisma.role.findUnique({ where: { id } })
		if (!existing) return null

		return prisma.role.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.description !== undefined && { description: data.description }),
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

		const existing = await prisma.rolePermission.findMany({
			where: { roleId, permissionId: { in: permissionIds } },
		})
		const existingIds = new Set(existing.map((rp) => rp.permissionId))
		const toAdd = permissionIds.filter((pid) => !existingIds.has(pid))

		if (toAdd.length) {
			await prisma.rolePermission.createMany({
				data: toAdd.map((permissionId) => ({ roleId, permissionId })),
			})
		}

		return this.list().then((roles) => roles.find((r) => r.id === roleId))
	}

	async removePermissions(roleId: number, permissionIds: number[]) {
		const role = await prisma.role.findUnique({ where: { id: roleId } })
		if (!role) return null

		await prisma.rolePermission.deleteMany({
			where: { roleId, permissionId: { in: permissionIds } },
		})

		return this.list().then((roles) => roles.find((r) => r.id === roleId))
	}
}

export const roleService = new RoleService()
