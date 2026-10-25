import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'

export const auditService = {
	async list({
		take = 24,
		page = 0,
		search,
		entity,
		action,
		actor_id,
	}: {
		take?: number
		page?: number
		search?: string
		entity?: string
		action?: string
		actor_id?: number
	}) {
		const where: Prisma.AdminAuditLogWhereInput = {}
		if (entity) {
			where.entity = entity
		}
		if (action) {
			where.action = action
		}
		if (actor_id !== undefined) {
			where.actor_id = actor_id
		}
		if (search) {
			where.OR = [
				{ actor_name: { contains: search, mode: 'insensitive' } },
				{ action: { contains: search, mode: 'insensitive' } },
				{ entity: { contains: search, mode: 'insensitive' } },
				{ entity_id: { contains: search, mode: 'insensitive' } },
			]
		}

		const clampTake = Math.min(Math.max(take, 1), 100)

		const [data, total_count] = await Promise.all([
			prisma.adminAuditLog.findMany({
				where,
				skip: page * clampTake,
				take: clampTake,
				orderBy: { created_at: 'desc' },
			}),
			prisma.adminAuditLog.count({ where }),
		])

		const facets = await prisma.adminAuditLog.groupBy({
			by: ['entity'],
			_count: { _all: true },
		})

		return {
			data,
			total_count,
			page: page + 1,
			take: clampTake,
			facets: {
				entities: Object.fromEntries(
					facets.map((f) => [f.entity, f._count._all])
				),
			},
		}
	},
}
