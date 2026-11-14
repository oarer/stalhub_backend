import { prisma } from '@/lib/prisma'
import { AUTHOR_WITH_BADGES_SELECT } from '@/utils/user-select'

class CommentsService {
	private async resolveArticleId(id: number | string) {
		const num = Number(id)
		const article = await prisma.article.findFirst({
			where: isNaN(num)
				? { external_id: String(id) }
				: { OR: [{ external_id: String(id) }, { id: num }] },
			select: { id: true },
		})
		return article?.id ?? null
	}

	private async resolveArtId(id: number | string) {
		const num = Number(id)
		const art = await prisma.art.findFirst({
			where: isNaN(num)
				? { external_id: String(id) }
				: { OR: [{ external_id: String(id) }, { id: num }] },
			select: { id: true },
		})
		return art?.id ?? null
	}

	private async resolveBuildId(id: number | string) {
		const num = Number(id)
		const build = await prisma.build.findFirst({
			where: isNaN(num)
				? { external_id: String(id) }
				: { OR: [{ external_id: String(id) }, { id: num }] },
			select: { id: true },
		})
		return build?.id ?? null
	}

	private async resolveTierListId(id: number | string) {
		const num = Number(id)
		const tierList = await prisma.tierList.findFirst({
			where: isNaN(num)
				? { external_id: String(id) }
				: { OR: [{ external_id: String(id) }, { id: num }] },
			select: { id: true },
		})
		return tierList?.id ?? null
	}

	private async resolvePostId(id: number | string) {
		const post = await prisma.post.findUnique({
			where: { external_id: String(id) },
			select: { id: true },
		})
		return post?.id ?? null
	}

	async listByArticle(id: number | string, take: number, page: number) {
		const article_id = await this.resolveArticleId(id)
		if (article_id === null) {
			return { data: [], total_count: 0, page: page + 1, take }
		}

		const skip = page * take

		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { article_id, parent_id: null },
				skip,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: AUTHOR_WITH_BADGES_SELECT,
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

	async listByArt(id: number | string, take: number, page: number) {
		const art_id = await this.resolveArtId(id)
		if (art_id === null) {
			return { data: [], total_count: 0, page: page + 1, take }
		}

		const skip = page * take

		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { art_id, parent_id: null },
				skip,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: AUTHOR_WITH_BADGES_SELECT,
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
		id: number | string,
		author_id: number,
		data: { content: string; parent_id?: number | null }
	) {
		const art_id = await this.resolveArtId(id)
		if (art_id === null) return null

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
				author: { select: AUTHOR_WITH_BADGES_SELECT },
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
		id: number | string,
		author_id: number,
		data: { content: string; parent_id?: number | null }
	) {
		const article_id = await this.resolveArticleId(id)
		if (article_id === null) return null

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
				author: { select: AUTHOR_WITH_BADGES_SELECT },
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

	async listByBuild(id: number | string, take: number, page: number) {
		const build_id = await this.resolveBuildId(id)
		if (build_id === null)
			return { data: [], total_count: 0, page: page + 1, take }
		const where = { build_id }
		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { ...where, parent_id: null },
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: { select: AUTHOR_WITH_BADGES_SELECT },
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
			prisma.articleComment.count({ where }),
		])
		return { data: rows, total_count: totalCount, page: page + 1, take }
	}

	async listByTierList(id: number | string, take: number, page: number) {
		const tier_list_id = await this.resolveTierListId(id)
		if (tier_list_id === null)
			return { data: [], total_count: 0, page: page + 1, take }
		const where = { tier_list_id }
		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { ...where, parent_id: null },
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: { select: AUTHOR_WITH_BADGES_SELECT },
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
			prisma.articleComment.count({ where }),
		])
		return { data: rows, total_count: totalCount, page: page + 1, take }
	}

	async listByPost(id: number | string, take: number, page: number) {
		const post_id = await this.resolvePostId(id)
		if (post_id === null)
			return { data: [], total_count: 0, page: page + 1, take }
		const where = { post_id }
		const [rows, totalCount] = await Promise.all([
			prisma.articleComment.findMany({
				where: { ...where, parent_id: null },
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: { select: AUTHOR_WITH_BADGES_SELECT },
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
			prisma.articleComment.count({ where }),
		])
		return { data: rows, total_count: totalCount, page: page + 1, take }
	}

	private async createForTarget(
		target: 'build' | 'tier_list' | 'post',
		id: number | string,
		author_id: number,
		data: { content: string; parent_id?: number | null }
	) {
		const targetId =
			target === 'build'
				? await this.resolveBuildId(id)
				: target === 'tier_list'
					? await this.resolveTierListId(id)
					: await this.resolvePostId(id)
		if (targetId === null) return null
		const relation =
			target === 'build'
				? { build_id: targetId }
				: target === 'tier_list'
					? { tier_list_id: targetId }
					: { post_id: targetId }
		if (data.parent_id) {
			const parent = await prisma.articleComment.findFirst({
				where: { id: data.parent_id, ...relation },
			})
			if (!parent) return null
		}
		const comment = await prisma.$transaction(async (tx) => {
			const created = await tx.articleComment.create({
				data: {
					content: data.content,
					author_id,
					parent_id: data.parent_id ?? null,
					...relation,
				},
				include: { author: { select: AUTHOR_WITH_BADGES_SELECT } },
			})
			if (target === 'build') {
				await tx.build.update({
					where: { id: targetId },
					data: { comments_count: { increment: 1 } },
				})
			} else if (target === 'tier_list') {
				await tx.tierList.update({
					where: { id: targetId },
					data: { comments_count: { increment: 1 } },
				})
			} else {
				await tx.post.update({
					where: { id: targetId },
					data: { comments_count: { increment: 1 } },
				})
			}
			return created
		})
		const owner =
			target === 'build'
				? await prisma.build.findUnique({
						where: { id: targetId },
						select: {
							author_id: true,
							title: true,
							external_id: true,
						},
					})
				: target === 'tier_list'
					? await prisma.tierList.findUnique({
							where: { id: targetId },
							select: {
								author_id: true,
								title: true,
								external_id: true,
							},
						})
					: await prisma.post.findUnique({
							where: { id: targetId },
							select: {
								author_id: true,
								title: true,
								external_id: true,
							},
						})
		const author = await prisma.user.findUnique({
			where: { id: author_id },
			select: { username: true },
		})
		const link =
			target === 'build'
				? `/builds/${targetId}`
				: target === 'tier_list'
					? `/tier-lists/${targetId}`
					: `/posts/${owner?.external_id ?? targetId}`
		if (owner?.author_id && owner.author_id !== author_id) {
			await prisma.notifications.create({
				data: {
					title: 'Новый комментарий',
					content: `${author?.username ?? 'Кто-то'} оставил комментарий к публикации "${owner.title}"`,
					author: author?.username ?? 'Система',
					type: 0,
					link,
					users: { connect: [{ id: owner.author_id }] },
				},
			})
		}
		const mentions = [
			...new Set(
				[...data.content.matchAll(/@([a-zA-Z0-9_]+)/g)].map(
					(match) => match[1]
				)
			),
		]
		if (mentions.length) {
			const mentionedUsers = await prisma.user.findMany({
				where: { username: { in: mentions } },
				select: { id: true },
			})
			for (const mentioned of mentionedUsers) {
				if (mentioned.id === author_id) continue
				await prisma.notifications.create({
					data: {
						title: 'Упоминание',
						content: `${author?.username ?? 'Кто-то'} упомянул вас в комментарии`,
						author: author?.username ?? 'Система',
						type: 0,
						link,
						users: { connect: [{ id: mentioned.id }] },
					},
				})
			}
		}
		return comment
	}

	createForBuild(
		id: number | string,
		author_id: number,
		data: { content: string; parent_id?: number | null }
	) {
		return this.createForTarget('build', id, author_id, data)
	}

	createForTierList(
		id: number | string,
		author_id: number,
		data: { content: string; parent_id?: number | null }
	) {
		return this.createForTarget('tier_list', id, author_id, data)
	}

	createForPost(
		id: number | string,
		author_id: number,
		data: { content: string; parent_id?: number | null }
	) {
		return this.createForTarget('post', id, author_id, data)
	}

	async delete(
		id: number,
		user_id: number,
		is_admin: boolean,
		target?: 'build' | 'tier_list' | 'post'
	) {
		const existing = await prisma.articleComment.findUnique({
			where: { id },
		})
		if (!existing) return false
		if (existing.author_id !== user_id && !is_admin) return false
		if (target === 'build' && !existing.build_id) return false
		if (target === 'tier_list' && !existing.tier_list_id) return false
		if (target === 'post' && !existing.post_id) return false
		await prisma.$transaction(async (tx) => {
			await tx.articleComment.delete({ where: { id } })
			if (existing.build_id) {
				const count = await tx.articleComment.count({
					where: { build_id: existing.build_id },
				})
				await tx.build.update({
					where: { id: existing.build_id },
					data: { comments_count: count },
				})
			}
			if (existing.tier_list_id) {
				const count = await tx.articleComment.count({
					where: { tier_list_id: existing.tier_list_id },
				})
				await tx.tierList.update({
					where: { id: existing.tier_list_id },
					data: { comments_count: count },
				})
			}
			if (existing.post_id) {
				const count = await tx.articleComment.count({
					where: { post_id: existing.post_id },
				})
				await tx.post.update({
					where: { id: existing.post_id },
					data: { comments_count: count },
				})
			}
		})
		return true
	}
}

export const commentsService = new CommentsService()
