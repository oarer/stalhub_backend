import { prisma } from '@/lib/prisma'

class CommentsService {
	async listByArticle(articleId: number, take: number, page: number) {
		const skip = page * take

		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { articleId, parentId: null },
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
			prisma.articleComment.count({ where: { articleId } }),
		])

		return {
			data: rows,
			totalCount,
		}
	}

	async create(
		articleId: number,
		authorId: number,
		data: { content: string; parentId?: number | null }
	) {
		if (data.parentId) {
			const parent = await prisma.articleComment.findFirst({
				where: { id: data.parentId, articleId },
			})
			if (!parent) return null
		}

		const comment = await prisma.articleComment.create({
			data: {
				content: data.content,
				articleId,
				authorId,
				parentId: data.parentId ?? null,
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
				where: { id: articleId },
				select: { title: true },
			})

			const mentionedUsers = await prisma.user.findMany({
				where: { username: { in: mentions } },
				select: { id: true, username: true },
			})

			const author = await prisma.user.findUnique({
				where: { id: authorId },
				select: { username: true },
			})

			const notifications = mentionedUsers
				.filter((u) => u.id !== authorId)
				.map((u) => ({
					title: 'Упоминание',
					content: `${author?.username ?? 'Кто-то'} упомянул вас в комментарии к статье "${article?.title ?? ''}"`,
					author: author?.username ?? 'Система',
					type: 0,
					link: `/articles/${articleId}`,
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

	async delete(id: number, userId: number, isAdmin: boolean) {
		const existing = await prisma.articleComment.findUnique({
			where: { id },
		})
		if (!existing) return false
		if (existing.authorId !== userId && !isAdmin) return false

		await prisma.articleComment.delete({ where: { id } })
		return true
	}
}

export const commentsService = new CommentsService()
