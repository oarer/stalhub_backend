import { ArticleStatus, StarTargetType } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'

function externalId() {
	return crypto.randomUUID().slice(0, 8)
}

class ArticlesService {
	async list(take: number, page: number) {
		const [rows, totalCount] = await Promise.all([
			prisma.article.findMany({
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: { id: true, name: true, username: true },
					},
				},
			}),
			prisma.article.count(),
		])

		const ids = rows.map((r) => r.id)
		const starCounts = await this.starCounts(ids)

		return {
			data: rows.map((a) => ({
				id: a.id,
				external_id: a.external_id,
				status: a.status,
				status_reason: a.status_reason,
				title: a.title,
				content: a.content,
				flags: a.flags,
				accent_color: a.accent_color,
				tags: a.tags ? a.tags.split(',').filter(Boolean) : [],
				author: a.author,
				stars_count: starCounts.get(a.id) ?? 0,
				created_at: a.created_at,
				updated_at: a.updated_at,
			})),
			totalCount,
		}
	}

	async getById(id: string, userId?: string) {
		const num = Number(id)
		const article = await prisma.article.findFirst({
			where: isNaN(num)
				? { external_id: id }
				: { OR: [{ external_id: id }, { id: num }] },
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		if (!article) return null

		const stars_count = await prisma.star.count({
			where: { targetType: StarTargetType.ARTICLE, targetId: article.id },
		})

		let is_starred = false
		if (userId) {
			const star = await prisma.star.findUnique({
				where: {
					targetType_targetId_userId: {
						targetType: StarTargetType.ARTICLE,
						targetId: article.id,
						userId,
					},
				},
			})
			is_starred = !!star
		}

		return {
			id: article.id,
			external_id: article.external_id,
			status: article.status,
			status_reason: article.status_reason,
			title: article.title,
			content: article.content,
			flags: article.flags,
			accent_color: article.accent_color,
			tags: article.tags ? article.tags.split(',').filter(Boolean) : [],
			author: article.author,
			stars_count,
			is_starred,
			created_at: article.created_at,
			updated_at: article.updated_at,
		}
	}

	async create(
		authorId: string,
		data: {
			title: string
			content: string
			flags?: number
			accent_color?: string
			tags?: string
		}
	) {
		const article = await prisma.article.create({
			data: {
				external_id: externalId(),
				title: data.title,
				content: data.content,
				flags: data.flags ?? 0,
				accent_color: data.accent_color,
				tags: data.tags ?? '',
				authorId,
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		await prisma.articleVersion.create({
			data: {
				articleId: article.id,
				version: '1.0.0',
				content: data.content,
			},
		})

		return {
			id: article.id,
			external_id: article.external_id,
			status: article.status,
			status_reason: article.status_reason,
			title: article.title,
			content: article.content,
			flags: article.flags,
			accent_color: article.accent_color,
			tags: article.tags ? article.tags.split(',').filter(Boolean) : [],
			author: article.author,
			stars_count: 0,
			is_starred: false,
			created_at: article.created_at,
			updated_at: article.updated_at,
		}
	}

	async update(
		id: number,
		authorId: string,
		isAdmin: boolean,
		data: {
			title?: string
			content?: string
			flags?: number
			accent_color?: string
			tags?: string
			version?: string
		}
	) {
		const existing = await prisma.article.findUnique({ where: { id } })
		if (!existing) return null
		if (existing.authorId !== authorId && !isAdmin)
			return { error: 'Forbidden' }

		const updateData: Record<string, unknown> = {}
		if (data.title !== undefined) updateData.title = data.title
		if (data.content !== undefined) updateData.content = data.content
		if (data.flags !== undefined) updateData.flags = data.flags
		if (data.accent_color !== undefined)
			updateData.accent_color = data.accent_color
		if (data.tags !== undefined) updateData.tags = data.tags

		const article = await prisma.article.update({
			where: { id },
			data: updateData,
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		if (data.content !== undefined) {
			await prisma.articleVersion.create({
				data: {
					articleId: id,
					version: data.version ?? this.nextVersion(existing),
					content: data.content,
				},
			})
		}

		const stars_count = await prisma.star.count({
			where: { targetType: StarTargetType.ARTICLE, targetId: article.id },
		})

		return {
			id: article.id,
			external_id: article.external_id,
			status: article.status,
			status_reason: article.status_reason,
			title: article.title,
			content: article.content,
			flags: article.flags,
			accent_color: article.accent_color,
			tags: article.tags ? article.tags.split(',').filter(Boolean) : [],
			author: article.author,
			stars_count,
			created_at: article.created_at,
			updated_at: article.updated_at,
		}
	}

	async setStatus(
		id: number,
		status: ArticleStatus,
		status_reason?: string | null
	) {
		const article = await prisma.article.findUnique({ where: { id } })
		if (!article) return null

		const updateData: Record<string, unknown> = { status }
		if (status === ArticleStatus.DENIED || status === ArticleStatus.BANNED) {
			updateData.status_reason = status_reason ?? null
		} else {
			updateData.status_reason = null
		}

		const updated = await prisma.article.update({
			where: { id },
			data: updateData,
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		const stars_count = await prisma.star.count({
			where: { targetType: StarTargetType.ARTICLE, targetId: updated.id },
		})

		return {
			id: updated.id,
			external_id: updated.external_id,
			status: updated.status,
			status_reason: updated.status_reason,
			title: updated.title,
			content: updated.content,
			flags: updated.flags,
			accent_color: updated.accent_color,
			tags: updated.tags ? updated.tags.split(',').filter(Boolean) : [],
			author: updated.author,
			stars_count,
			created_at: updated.created_at,
			updated_at: updated.updated_at,
		}
	}

	async delete(id: number, authorId: string, isAdmin: boolean) {
		const existing = await prisma.article.findUnique({ where: { id } })
		if (!existing) return false
		if (existing.authorId !== authorId && !isAdmin) return false
		await prisma.article.delete({ where: { id } })
		return true
	}

	async getVersions(articleId: number) {
		return prisma.articleVersion.findMany({
			where: { articleId },
			orderBy: { created_at: 'desc' },
			select: { id: true, version: true, created_at: true },
		})
	}

	async getVersion(id: number) {
		return prisma.articleVersion.findUnique({ where: { id } })
	}

	async addStar(articleId: number, userId: string) {
		await prisma.star.upsert({
			where: {
				targetType_targetId_userId: {
					targetType: StarTargetType.ARTICLE,
					targetId: articleId,
					userId,
				},
			},
			create: {
				targetType: StarTargetType.ARTICLE,
				targetId: articleId,
				userId,
			},
			update: {},
		})
	}

	async removeStar(articleId: number, userId: string) {
		await prisma.star.deleteMany({
			where: {
				targetType: StarTargetType.ARTICLE,
				targetId: articleId,
				userId,
			},
		})
	}

	private nextVersion(article: { id: number }): string {
		return `${Date.now()}`
	}

	private async starCounts(ids: number[]) {
		if (!ids.length) return new Map<number, number>()

		const rows = await prisma.star.groupBy({
			by: ['targetId'],
			where: {
				targetType: StarTargetType.ARTICLE,
				targetId: { in: ids },
			},
			_count: { targetId: true },
		})

		const map = new Map<number, number>()
		for (const r of rows) map.set(r.targetId, r._count.targetId)
		return map
	}
}

export const articlesService = new ArticlesService()
