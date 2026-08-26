import {
	ArticleStatus,
	ArticleType,
	Prisma,
	type QuestType,
	StarTargetType,
} from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { generateSlug } from '@/utils/slug'

class ArticlesService {
	async list(
		take: number,
		page: number,
		opts?: { all?: boolean; author_id?: number }
	) {
		const where: Prisma.ArticleWhereInput = {}
		if (opts?.all) {
			// без фильтра
		} else if (opts?.author_id) {
			where.author_id = opts.author_id
		} else {
			where.status = ArticleStatus.APPROVED
		}

		const [rows, totalCount] = await Promise.all([
			prisma.article.findMany({
				where,
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: { id: true, name: true, username: true },
					},
				},
			}),
			prisma.article.count({ where }),
		])

		const ids = rows.map((r) => r.id)
		const starCounts = await this.starCounts(ids)

		return {
			data: rows.map((a) => ({
				id: a.id,
				external_id: a.external_id,
				status: a.status,
				status_reason: a.status_reason,
				type: a.type,
				title: a.title,
				content: a.content,
				image_url: a.image_url,
				quest_name: a.type === ArticleType.QUEST ? a.quest_name : null,
				quest_type: a.type === ArticleType.QUEST ? a.quest_type : null,
				quest_map: a.type === ArticleType.QUEST ? a.quest_map : null,
				reward_text:
					a.type === ArticleType.QUEST ? a.reward_text : null,
				reward_money:
					a.type === ArticleType.QUEST ? a.reward_money : null,
				flags: a.flags,
				tags: a.tags ? a.tags.split(',').filter(Boolean) : [],
				author: a.author,
				stars_count: starCounts.get(a.id) ?? 0,
				created_at: a.created_at,
				updated_at: a.updated_at,
			})),
			total_count: totalCount,
			page: page + 1,
			take,
		}
	}

	async getOwned(id: number, user_id: number, is_admin: boolean) {
		return prisma.article.findFirst({
			where: { id, ...(is_admin ? {} : { author_id: user_id }) },
			select: { id: true },
		})
	}

	async getById(id: string, user_id?: number) {
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
			where: {
				target_type: StarTargetType.ARTICLE,
				target_id: article.id,
			},
		})

		let is_starred = false
		if (user_id) {
			const star = await prisma.star.findUnique({
				where: {
					target_type_target_id_user_id: {
						target_type: StarTargetType.ARTICLE,
						target_id: article.id,
						user_id,
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
			type: article.type,
			title: article.title,
			content: article.content,
			image_url: article.image_url,
			quest_name:
				article.type === ArticleType.QUEST ? article.quest_name : null,
			quest_type:
				article.type === ArticleType.QUEST ? article.quest_type : null,
			quest_map:
				article.type === ArticleType.QUEST ? article.quest_map : null,

			reward_text:
				article.type === ArticleType.QUEST ? article.reward_text : null,
			reward_money:
				article.type === ArticleType.QUEST
					? article.reward_money
					: null,
			flags: article.flags,
			tags: article.tags ? article.tags.split(',').filter(Boolean) : [],
			author: article.author,
			stars_count,
			is_starred,
			created_at: article.created_at,
			updated_at: article.updated_at,
		}
	}

	async create(
		author_id: number,
		data: {
			title: string
			content: string
			type?: string
			rewards?: unknown
			flags?: number
			tags?: string
			image_url?: string
			quest_name?: string | null
			quest_type?: string | null
			quest_map?: unknown
			reward_text?: string | null
			reward_money?: number | null
		}
	) {
		const articleType = (data.type as ArticleType) ?? ArticleType.OTHER

		const article = await prisma.article.create({
			data: {
				external_id: generateSlug(data.title),
				title: data.title,
				content: data.content,
				type: articleType,
				image_url: data.image_url ?? undefined,
				quest_name:
					articleType === ArticleType.QUEST ? data.quest_name : null,
				quest_type:
					articleType === ArticleType.QUEST
						? (data.quest_type as QuestType | null | undefined)
						: null,
				quest_map:
					articleType === ArticleType.QUEST && data.quest_map
						? (data.quest_map as Prisma.InputJsonValue)
						: undefined,
				reward_text:
					articleType === ArticleType.QUEST ? data.reward_text : null,
				reward_money:
					articleType === ArticleType.QUEST
						? data.reward_money
						: null,
				rewards:
					articleType === ArticleType.QUEST &&
					data.rewards !== undefined
						? (data.rewards as Prisma.InputJsonValue)
						: undefined,
				flags: data.flags ?? 0,
				tags: data.tags ?? '',
				author_id,
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		await prisma.articleVersion.create({
			data: {
				article_id: article.id,
				version: '1.0.0',
				content: data.content,
			},
		})

		return {
			id: article.id,
			external_id: article.external_id,
			status: article.status,
			status_reason: article.status_reason,
			type: article.type,
			title: article.title,
			content: article.content,
			image_url: article.image_url,
			quest_name:
				article.type === ArticleType.QUEST ? article.quest_name : null,
			quest_type:
				article.type === ArticleType.QUEST ? article.quest_type : null,
			quest_map:
				article.type === ArticleType.QUEST ? article.quest_map : null,

			reward_text:
				article.type === ArticleType.QUEST ? article.reward_text : null,
			reward_money:
				article.type === ArticleType.QUEST
					? article.reward_money
					: null,
			flags: article.flags,
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
		author_id: number,
		is_admin: boolean,
		data: {
			title?: string
			content?: string
			type?: string
			rewards?: unknown
			flags?: number
			tags?: string
			image_url?: string | null
			quest_name?: string | null
			quest_type?: string | null
			quest_map?: unknown
			reward_text?: string | null
			reward_money?: number | null
			version?: string
		}
	) {
		const existing = await prisma.article.findUnique({ where: { id } })
		if (!existing) return null
		if (existing.author_id !== author_id && !is_admin)
			return { error: 'Forbidden' }

		const resolvedType = (data.type as ArticleType) ?? existing.type

		const updateData: Record<string, unknown> = {}
		if (data.title !== undefined) updateData.title = data.title
		if (data.content !== undefined) updateData.content = data.content
		if (data.type !== undefined) updateData.type = data.type
		if (data.rewards !== undefined) {
			if (resolvedType === ArticleType.QUEST) {
				updateData.rewards = data.rewards
			}
		}
		if (data.flags !== undefined) updateData.flags = data.flags
		if (data.tags !== undefined) updateData.tags = data.tags
		if (data.image_url !== undefined) updateData.image_url = data.image_url
		if (resolvedType === ArticleType.QUEST) {
			if (data.quest_name !== undefined)
				updateData.quest_name = data.quest_name
			if (data.quest_type !== undefined)
				updateData.quest_type = data.quest_type
			if (data.quest_map !== undefined)
				updateData.quest_map = data.quest_map ?? Prisma.JsonNull
			if (data.reward_text !== undefined)
				updateData.reward_text = data.reward_text
			if (data.reward_money !== undefined)
				updateData.reward_money = data.reward_money
		} else {
			Object.assign(updateData, {
				quest_name: null,
				quest_type: null,
				quest_map: Prisma.JsonNull,
				reward_text: null,
				reward_money: null,
			})
		}

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
					article_id: id,
					version: data.version ?? this.nextVersion(existing),
					content: data.content,
				},
			})
		}

		const stars_count = await prisma.star.count({
			where: {
				target_type: StarTargetType.ARTICLE,
				target_id: article.id,
			},
		})

		return {
			id: article.id,
			external_id: article.external_id,
			status: article.status,
			status_reason: article.status_reason,
			type: article.type,
			title: article.title,
			content: article.content,
			image_url: article.image_url,
			quest_name:
				article.type === ArticleType.QUEST ? article.quest_name : null,
			quest_type:
				article.type === ArticleType.QUEST ? article.quest_type : null,
			quest_map:
				article.type === ArticleType.QUEST ? article.quest_map : null,

			reward_text:
				article.type === ArticleType.QUEST ? article.reward_text : null,
			reward_money:
				article.type === ArticleType.QUEST
					? article.reward_money
					: null,
			flags: article.flags,

			tags: article.tags ? article.tags.split(',').filter(Boolean) : [],
			author: article.author,
			stars_count,
			created_at: article.created_at,
			updated_at: article.updated_at,
		}
	}

	async submitForReview(id: number, author_id: number) {
		const article = await prisma.article.findUnique({ where: { id } })
		if (!article) return null
		if (article.author_id !== author_id) return { error: 'Forbidden' }

		const newStatus =
			article.status === ArticleStatus.REVIEW
				? ArticleStatus.PENDING
				: ArticleStatus.REVIEW

		const updated = await prisma.article.update({
			where: { id },
			data: { status: newStatus, status_reason: null },
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		const stars_count = await prisma.star.count({
			where: {
				target_type: StarTargetType.ARTICLE,
				target_id: updated.id,
			},
		})

		return {
			id: updated.id,
			external_id: updated.external_id,
			status: updated.status,
			status_reason: updated.status_reason,
			type: updated.type,
			title: updated.title,
			content: updated.content,
			image_url: updated.image_url,
			quest_name:
				updated.type === ArticleType.QUEST ? updated.quest_name : null,
			quest_type:
				updated.type === ArticleType.QUEST ? updated.quest_type : null,
			quest_map:
				updated.type === ArticleType.QUEST ? updated.quest_map : null,
			reward_text:
				updated.type === ArticleType.QUEST ? updated.reward_text : null,
			reward_money:
				updated.type === ArticleType.QUEST
					? updated.reward_money
					: null,
			flags: updated.flags,
			tags: updated.tags ? updated.tags.split(',').filter(Boolean) : [],
			author: updated.author,
			stars_count,
			created_at: updated.created_at,
			updated_at: updated.updated_at,
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
		if (
			status === ArticleStatus.DENIED ||
			status === ArticleStatus.BANNED
		) {
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
			where: {
				target_type: StarTargetType.ARTICLE,
				target_id: updated.id,
			},
		})

		return {
			id: updated.id,
			external_id: updated.external_id,
			status: updated.status,
			status_reason: updated.status_reason,
			type: updated.type,
			title: updated.title,
			content: updated.content,
			image_url: updated.image_url,
			quest_name:
				updated.type === ArticleType.QUEST ? updated.quest_name : null,
			quest_type:
				updated.type === ArticleType.QUEST ? updated.quest_type : null,
			quest_map:
				updated.type === ArticleType.QUEST ? updated.quest_map : null,
			reward_text:
				updated.type === ArticleType.QUEST ? updated.reward_text : null,
			reward_money:
				updated.type === ArticleType.QUEST
					? updated.reward_money
					: null,
			flags: updated.flags,
			tags: updated.tags ? updated.tags.split(',').filter(Boolean) : [],
			author: updated.author,
			stars_count,
			created_at: updated.created_at,
			updated_at: updated.updated_at,
		}
	}

	async delete(id: number, author_id: number, is_admin: boolean) {
		const existing = await prisma.article.findUnique({ where: { id } })
		if (!existing) return false
		if (existing.author_id !== author_id && !is_admin) return false
		await prisma.article.delete({ where: { id } })
		return true
	}

	async getVersions(article_id: number) {
		return prisma.articleVersion.findMany({
			where: { article_id },
			orderBy: { created_at: 'desc' },
			select: { id: true, version: true, created_at: true },
		})
	}

	async getVersion(id: number) {
		return prisma.articleVersion.findUnique({ where: { id } })
	}

	async addStar(article_id: number, user_id: number) {
		await prisma.star.upsert({
			where: {
				target_type_target_id_user_id: {
					target_type: StarTargetType.ARTICLE,
					target_id: article_id,
					user_id,
				},
			},
			create: {
				target_type: StarTargetType.ARTICLE,
				target_id: article_id,
				user_id,
			},
			update: {},
		})
	}

	async removeStar(article_id: number, user_id: number) {
		await prisma.star.deleteMany({
			where: {
				target_type: StarTargetType.ARTICLE,
				target_id: article_id,
				user_id,
			},
		})
	}

	private nextVersion(article: { id: number }): string {
		return `${Date.now()}`
	}

	private async starCounts(ids: number[]) {
		if (!ids.length) return new Map<number, number>()

		const rows = await prisma.star.groupBy({
			by: ['target_id'],
			where: {
				target_type: StarTargetType.ARTICLE,
				target_id: { in: ids },
			},
			_count: { target_id: true },
		})

		const map = new Map<number, number>()
		for (const r of rows) map.set(r.target_id, r._count.target_id)
		return map
	}
}

export const articlesService = new ArticlesService()
