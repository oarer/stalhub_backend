import { prisma } from '@/lib/prisma'

class ProfileCommentsService {
	async listByUser(userId: number, take: number, page: number) {
		const skip = page * take

		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { profile_user_id: userId, parent_id: null },
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
			prisma.articleComment.count({
				where: { profile_user_id: userId, parent_id: null },
			}),
		])

		return {
			data: rows,
			total_count: totalCount,
			page: page + 1,
			take,
		}
	}

	async create(
		userId: number,
		authorId: number,
		data: { content: string; parent_id?: number | null }
	) {
		if (data.parent_id) {
			const parent = await prisma.articleComment.findFirst({
				where: { id: data.parent_id, profile_user_id: userId },
			})
			if (!parent) return null
		}

		const comment = await prisma.articleComment.create({
			data: {
				content: data.content,
				profile_user_id: userId,
				author_id: authorId,
				parent_id: data.parent_id ?? null,
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		const profileOwner = await prisma.user.findUnique({
			where: { id: userId },
			select: { username: true },
		})

		if (userId !== authorId) {
			const author = await prisma.user.findUnique({
				where: { id: authorId },
				select: { username: true },
			})

			await prisma.notifications.create({
				data: {
					title: 'Новый комментарий',
					content: `${author?.username ?? 'Кто-то'} оставил комментарий на вашей странице`,
					author: author?.username ?? 'Система',
					type: 0,
					link: `/profile/${userId}`,
					users: { connect: [{ id: userId }] },
				},
			})
		}

		const mentionRegex = /@([a-zA-Z0-9_]+)/g
		const mentions = [
			...new Set(
				[...data.content.matchAll(mentionRegex)].map((m) => m[1])
			),
		]

		if (mentions.length > 0) {
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
					content: `${author?.username ?? 'Кто-то'} упомянул вас в комментарии на странице ${profileOwner?.username ?? 'пользователя'}`,
					author: author?.username ?? 'Система',
					type: 0,
					link: `/profile/${userId}`,
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

	async delete(commentId: number, userId: number, isAdmin: boolean) {
		const existing = await prisma.articleComment.findUnique({
			where: { id: commentId },
		})
		if (!existing) return false
		if (existing.author_id !== userId && !isAdmin) return false

		await prisma.articleComment.delete({ where: { id: commentId } })
		return true
	}
}

export const profileCommentsService = new ProfileCommentsService()
