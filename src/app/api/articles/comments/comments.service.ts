import { prisma } from '@/lib/prisma'

class CommentsService {
	async listByArticle(article_id: number, take: number, page: number) {
		const skip = page * take

		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { article_id, parent_id: null },
				skip,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: { id: true, name: true, username: true },
					},
					replies: {
						orderBy: { created_at: 'asc' },
						include: {
							author: {
								select: {
									id: true,
									name: true,
									username: true,
								},
							},
						},
					},
				},
			}),
			prisma.articleComment.count({ where: { article_id } }),
		])

		return {
			data: rows,
			total_count: totalCount,
			page: page + 1,
			take,
		}
	}

	async listByArt(art_id: number, take: number, page: number) {
		const skip = page * take

		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { art_id, parent_id: null },
				skip,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: { id: true, name: true, username: true },
					},
					replies: {
						orderBy: { created_at: 'asc' },
						include: {
							author: {
								select: {
									id: true,
									name: true,
									username: true,
								},
							},
						},
					},
				},
			}),
			prisma.articleComment.count({ where: { art_id } }),
		])

		return {
			data: rows,
			total_count: totalCount,
			page: page + 1,
			take,
		}
	}

	async createForArt(
		art_id: number,
		author_id: number,
		data: { content: string; parent_id?: number | null }
	) {
		if (data.parent_id) {
			const parent = await prisma.articleComment.findFirst({
				where: { id: data.parent_id, art_id },
			})
			if (!parent) return null
		}

		const comment = await prisma.articleComment.create({
			data: {
				content: data.content,
				art_id,
				author_id,
				parent_id: data.parent_id ?? null,
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		const mentionRegex = /@([a-zA-Z0-9_]+)/g
		const mentions = [
			...new Set(
				[...data.content.matchAll(mentionRegex)].map((m) => m[1])
			),
		]

		if (mentions.length > 0) {
			const art = await prisma.art.findUnique({
				where: { id: art_id },
				select: { title: true },
			})

			const mentionedUsers = await prisma.user.findMany({
				where: { username: { in: mentions } },
				select: { id: true, username: true },
			})

			const author = await prisma.user.findUnique({
				where: { id: author_id },
				select: { username: true },
			})

			const notifications = mentionedUsers
				.filter((u) => u.id !== author_id)
				.map((u) => ({
					title: 'Упоминание',
					content: `${author?.username ?? 'Кто-то'} упомянул вас в комментарии к работе "${art?.title ?? ''}"`,
					author: author?.username ?? 'Система',
					type: 0,
					link: `/arts/${art_id}`,
					users: { connect: [{ id: u.id }] },
				}))

			if (notifications.length > 0) {
				for (const n of notifications) {
					await prisma.notifications.create({ data: n })
				}
			}
		}

		return comment
	}

	async create(
		article_id: number,
		author_id: number,
		data: { content: string; parent_id?: number | null }
	) {
		if (data.parent_id) {
			const parent = await prisma.articleComment.findFirst({
				where: { id: data.parent_id, article_id },
			})
			if (!parent) return null
		}

		const comment = await prisma.articleComment.create({
			data: {
				content: data.content,
				article_id,
				author_id,
				parent_id: data.parent_id ?? null,
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		const mentionRegex = /@([a-zA-Z0-9_]+)/g
		const mentions = [
			...new Set(
				[...data.content.matchAll(mentionRegex)].map((m) => m[1])
			),
		]

		if (mentions.length > 0) {
			const article = await prisma.article.findUnique({
				where: { id: article_id },
				select: { title: true },
			})

			const mentionedUsers = await prisma.user.findMany({
				where: { username: { in: mentions } },
				select: { id: true, username: true },
			})

			const author = await prisma.user.findUnique({
				where: { id: author_id },
				select: { username: true },
			})

			const notifications = mentionedUsers
				.filter((u) => u.id !== author_id)
				.map((u) => ({
					title: 'Упоминание',
					content: `${author?.username ?? 'Кто-то'} упомянул вас в комментарии к статье "${article?.title ?? ''}"`,
					author: author?.username ?? 'Система',
					type: 0,
					link: `/articles/${article_id}`,
					users: { connect: [{ id: u.id }] },
				}))

			if (notifications.length > 0) {
				for (const n of notifications) {
					await prisma.notifications.create({ data: n })
				}
			}
		}

		return comment
	}

	async delete(id: number, user_id: number, is_admin: boolean) {
		const existing = await prisma.articleComment.findUnique({
			where: { id },
		})
		if (!existing) return false
		if (existing.author_id !== user_id && !is_admin) return false

		await prisma.articleComment.delete({ where: { id } })
		return true
	}
}

export const commentsService = new CommentsService()
