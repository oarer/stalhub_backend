import { prisma } from '@/lib/prisma'
import { StarTargetType } from 'generated/prisma/client'

function externalId() {
	return crypto.randomUUID().slice(0, 8)
}

class BuildsService {
	async list(take: number, page: number) {
		const [rows, totalCount] = await Promise.all([
			prisma.build.findMany({
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: { select: { id: true, name: true, username: true } },
				},
			}),
			prisma.build.count(),
		])

		const ids = rows.map((r) => r.id)
		const starCounts = await this.starCounts(ids)

		return {
			data: rows.map((b) => ({
				id: b.id,
				external_id: b.external_id,
				title: b.title,
				data: JSON.parse(b.data),
				flags: b.flags,
				accent_color: b.accent_color,
				tags: b.tags ? b.tags.split(',').filter(Boolean) : [],
				author: b.author,
				stars_count: starCounts.get(b.id) ?? 0,
				created_at: b.created_at,
				updated_at: b.updated_at,
			})),
			totalCount,
		}
	}

	async getById(id: string, userId?: string) {
		const num = Number(id)
		const build = await prisma.build.findFirst({
			where: isNaN(num) ? { external_id: id } : { OR: [{ external_id: id }, { id: num }] },
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		if (!build) return null

		const stars_count = await prisma.star.count({
			where: { targetType: StarTargetType.BUILD, targetId: build.id },
		})

		let is_starred = false
		if (userId) {
			const star = await prisma.star.findUnique({
				where: { targetType_targetId_userId: { targetType: StarTargetType.BUILD, targetId: build.id, userId } },
			})
			is_starred = !!star
		}

		return {
			id: build.id,
			external_id: build.external_id,
			title: build.title,
			data: JSON.parse(build.data),
			flags: build.flags,
			accent_color: build.accent_color,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			author: build.author,
			stars_count,
			is_starred,
			created_at: build.created_at,
			updated_at: build.updated_at,
		}
	}

	async create(authorId: string, data: { title: string; data: string; flags?: number; accent_color?: string; tags?: string }) {
		const build = await prisma.build.create({
			data: {
				external_id: externalId(),
				title: data.title,
				data: data.data,
				flags: data.flags ?? 0,
				accent_color: data.accent_color,
				tags: data.tags ?? '',
				authorId,
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		return {
			id: build.id,
			external_id: build.external_id,
			title: build.title,
			data: JSON.parse(build.data),
			flags: build.flags,
			accent_color: build.accent_color,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			author: build.author,
			stars_count: 0,
			is_starred: false,
			created_at: build.created_at,
			updated_at: build.updated_at,
		}
	}

	async update(
		id: number,
		authorId: string,
		isAdmin: boolean,
		data: { title?: string; data?: string; flags?: number; accent_color?: string; tags?: string }
	) {
		const existing = await prisma.build.findUnique({ where: { id } })
		if (!existing) return null
		if (existing.authorId !== authorId && !isAdmin) return { error: 'Forbidden' }

		const build = await prisma.build.update({
			where: { id },
			data: {
				...(data.title !== undefined && { title: data.title }),
				...(data.data !== undefined && { data: data.data }),
				...(data.flags !== undefined && { flags: data.flags }),
				...(data.accent_color !== undefined && { accent_color: data.accent_color }),
				...(data.tags !== undefined && { tags: data.tags }),
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		const stars_count = await prisma.star.count({
			where: { targetType: StarTargetType.BUILD, targetId: build.id },
		})

		return {
			id: build.id,
			external_id: build.external_id,
			title: build.title,
			data: JSON.parse(build.data),
			flags: build.flags,
			accent_color: build.accent_color,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			author: build.author,
			stars_count,
			created_at: build.created_at,
			updated_at: build.updated_at,
		}
	}

	async delete(id: number, authorId: string, isAdmin: boolean) {
		const existing = await prisma.build.findUnique({ where: { id } })
		if (!existing) return false
		if (existing.authorId !== authorId && !isAdmin) return false
		await prisma.build.delete({ where: { id } })
		return true
	}

	async addStar(buildId: number, userId: string) {
		await prisma.star.upsert({
			where: { targetType_targetId_userId: { targetType: StarTargetType.BUILD, targetId: buildId, userId } },
			create: { targetType: StarTargetType.BUILD, targetId: buildId, userId },
			update: {},
		})
	}

	async removeStar(buildId: number, userId: string) {
		await prisma.star.deleteMany({
			where: { targetType: StarTargetType.BUILD, targetId: buildId, userId },
		})
	}

	private async starCounts(ids: number[]) {
		if (!ids.length) return new Map<number, number>()

		const rows = await prisma.star.groupBy({
			by: ['targetId'],
			where: { targetType: StarTargetType.BUILD, targetId: { in: ids } },
			_count: { targetId: true },
		})

		const map = new Map<number, number>()
		for (const r of rows) map.set(r.targetId, r._count.targetId)
		return map
	}
}

export const buildsService = new BuildsService()
