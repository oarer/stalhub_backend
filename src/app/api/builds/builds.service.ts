import { StarTargetType } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import type { BuildData } from '@/types/build.type'

function externalId() {
	return crypto.randomUUID().slice(0, 8)
}

function compress(data: BuildData): string {
	const compressed = Bun.deflateSync(
		new TextEncoder().encode(JSON.stringify(data))
	)

	return 'v1:' + Buffer.from(compressed).toString('base64')
}

function decompress(raw: string): BuildData {
	if (raw.startsWith('v1:')) {
		const b64 = raw.slice(3)
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
		const json = Bun.inflateSync(bytes)
		return JSON.parse(new TextDecoder().decode(json))
	}
	return JSON.parse(raw)
}

const MAX_BUILD_SIZE = 50_000

class BuildsService {
	async list(take: number, page: number) {
		const [rows, totalCount] = await Promise.all([
			prisma.build.findMany({
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: { id: true, name: true, username: true },
					},
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
				data: decompress(b.data),
				flags: b.flags,
				tags: b.tags ? b.tags.split(',').filter(Boolean) : [],
				author: b.author,
				stars_count: starCounts.get(b.id) ?? 0,
				created_at: b.created_at,
				updated_at: b.updated_at,
			})),
			totalCount,
		}
	}

	async getById(id: string, userId?: number) {
		const num = Number(id)
		const build = await prisma.build.findFirst({
			where: isNaN(num)
				? { external_id: id }
				: { OR: [{ external_id: id }, { id: num }] },
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
				where: {
					targetType_targetId_userId: {
						targetType: StarTargetType.BUILD,
						targetId: build.id,
						userId,
					},
				},
			})
			is_starred = !!star
		}

		return {
			id: build.id,
			external_id: build.external_id,
			title: build.title,
			data: decompress(build.data),
			flags: build.flags,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			author: build.author,
			stars_count,
			is_starred,
			created_at: build.created_at,
			updated_at: build.updated_at,
		}
	}

	async create(
		authorId: number,
		data: {
			title: string
			data: BuildData
			flags?: number
			tags?: string
		}
	) {
		const compressed = compress(data.data)
		if (compressed.length > MAX_BUILD_SIZE) {
			return { error: 'Build data exceeds maximum size' }
		}

		const build = await prisma.build.create({
			data: {
				external_id: externalId(),
				title: data.title,
				data: compressed,
				flags: data.flags ?? 0,
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
			data: decompress(build.data),
			flags: build.flags,
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
		authorId: number,
		isAdmin: boolean,
		data: {
			title?: string
			data?: BuildData
			flags?: number
			tags?: string
		}
	) {
		const existing = await prisma.build.findUnique({ where: { id } })
		if (!existing) return null
		if (existing.authorId !== authorId && !isAdmin)
			return { error: 'Forbidden' }

		const updateData: Record<string, unknown> = {}
		if (data.title !== undefined) updateData.title = data.title
		if (data.data !== undefined) {
			const compressed = compress(data.data)
			if (compressed.length > MAX_BUILD_SIZE) {
				return { error: 'Build data exceeds maximum size' }
			}
			updateData.data = compressed
		}
		if (data.flags !== undefined) updateData.flags = data.flags
		if (data.tags !== undefined) updateData.tags = data.tags

		const build = await prisma.build.update({
			where: { id },
			data: updateData,
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
			data: decompress(build.data),
			flags: build.flags,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			author: build.author,
			stars_count,
			created_at: build.created_at,
			updated_at: build.updated_at,
		}
	}

	async delete(id: number, authorId: number, isAdmin: boolean) {
		const existing = await prisma.build.findUnique({ where: { id } })
		if (!existing) return false
		if (existing.authorId !== authorId && !isAdmin) return false
		await prisma.build.delete({ where: { id } })
		return true
	}

	async addStar(buildId: number, userId: number) {
		await prisma.star.upsert({
			where: {
				targetType_targetId_userId: {
					targetType: StarTargetType.BUILD,
					targetId: buildId,
					userId,
				},
			},
			create: {
				targetType: StarTargetType.BUILD,
				targetId: buildId,
				userId,
			},
			update: {},
		})
	}

	async removeStar(buildId: number, userId: number) {
		await prisma.star.deleteMany({
			where: {
				targetType: StarTargetType.BUILD,
				targetId: buildId,
				userId,
			},
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
