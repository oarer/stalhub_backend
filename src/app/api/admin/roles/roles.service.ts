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

	async update(
		id: number,
		data: { name?: string; description?: string; rank?: number }
	) {
		const existing = await prisma.role.findUnique({ where: { id } })
		if (!existing) return null

		return prisma.role.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.description !== undefined && {
					description: data.description,
				}),
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

	async addPermissions(role_id: number, permission_ids: number[]) {
		const role = await prisma.role.findUnique({ where: { id: role_id } })
		if (!role) return null

		await prisma.role.update({
			where: { id: role_id },
			data: {
				permissions: {
					connect: permission_ids.map((id) => ({ id })),
				},
			},
		})

		return this.list().then((roles) => roles.find((r) => r.id === role_id))
	}

	async removePermissions(role_id: number, permission_ids: number[]) {
		const role = await prisma.role.findUnique({ where: { id: role_id } })
		if (!role) return null

		await prisma.role.update({
			where: { id: role_id },
			data: {
				permissions: {
					disconnect: permission_ids.map((id) => ({ id })),
				},
			},
		})

		return this.list().then((roles) => roles.find((r) => r.id === role_id))
	}
}

export const roleService = new RoleService()
