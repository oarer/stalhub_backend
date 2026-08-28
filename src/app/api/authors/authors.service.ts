import { ArticleStatus } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'

const AUTHOR_SELECT = { id: true, name: true, username: true } as const

export class AuthorsService {
	async getTopAuthorOfWeek() {
		const [week, month] = await Promise.all([
			this.getTopAuthors(7, 1),
			this.getTopAuthors(30, 3),
		])

		const addWorks = (entry: (typeof week)[number], days: number) =>
			this.getPopularWorks(days, entry.user.id)

		return {
			week: week[0]
				? { ...week[0], works: await addWorks(week[0], 7) }
				: null,
			month: await Promise.all(
				month.map(async (entry) => ({
					...entry,
					works: await addWorks(entry, 30),
				}))
			),
		}
	}

	private async getTopAuthors(days: number, take: number) {
		const weekAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

		const [buildViews, articleViews, artViews, tierListCounts] =
			await Promise.all([
				prisma.build.groupBy({
					by: ['author_id'],
					where: { created_at: { gte: weekAgo } },
					_sum: { views: true },
				}),
				prisma.article.groupBy({
					by: ['author_id'],
					where: {
						status: ArticleStatus.APPROVED,
						created_at: { gte: weekAgo },
					},
					_sum: { views: true },
				}),
				prisma.art.groupBy({
					by: ['author_id'],
					where: {
						author_id: { not: null },
						created_at: { gte: weekAgo },
					},
					_sum: { views: true },
				}),
				prisma.tierList.groupBy({
					by: ['author_id'],
					where: {
						author_id: { not: null },
						kind: 'USER',
						is_public: true,
						created_at: { gte: weekAgo },
					},
					_count: { id: true },
				}),
			])

		const viewMap = new Map<
			number,
			{
				builds: number
				articles: number
				arts: number
				tier_lists: number
				total: number
			}
		>()
		const add = (
			userId: number,
			kind: 'builds' | 'articles' | 'arts' | 'tier_lists',
			views: number
		) => {
			const entry = viewMap.get(userId) ?? {
				builds: 0,
				articles: 0,
				arts: 0,
				tier_lists: 0,
				total: 0,
			}
			entry[kind] = views
			entry.total += views
			viewMap.set(userId, entry)
		}

		for (const row of buildViews)
			if (row.author_id) add(row.author_id, 'builds', row._sum.views ?? 0)
		for (const row of articleViews)
			add(row.author_id, 'articles', row._sum.views ?? 0)
		for (const row of artViews)
			if (row.author_id) add(row.author_id, 'arts', row._sum.views ?? 0)
		for (const row of tierListCounts)
			if (row.author_id) add(row.author_id, 'tier_lists', row._count.id)

		const ranked = [...viewMap.entries()]
			.sort((a, b) => b[1].total - a[1].total)
			.slice(0, take)
		const users = await prisma.user.findMany({
			where: { id: { in: ranked.map(([id]) => id) } },
			select: AUTHOR_SELECT,
		})
		const usersById = new Map(users.map((user) => [user.id, user]))
		return ranked.flatMap(([id, views]) => {
			const user = usersById.get(id)
			return user ? [{ user, views }] : []
		})
	}

	private async getPopularWorks(days: number, authorId?: number) {
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
		const [builds, articles, arts, tierLists] = await Promise.all([
			prisma.build.findMany({
				where: {
					created_at: { gte: since },
					...(authorId !== undefined && { author_id: authorId }),
				},
				orderBy: [{ views: 'desc' }, { created_at: 'desc' }],
				take: 3,
				select: {
					id: true,
					external_id: true,
					title: true,
					views: true,
					created_at: true,
					author: { select: AUTHOR_SELECT },
				},
			}),
			prisma.article.findMany({
				where: {
					status: ArticleStatus.APPROVED,
					created_at: { gte: since },
					...(authorId !== undefined && { author_id: authorId }),
				},
				orderBy: [{ views: 'desc' }, { created_at: 'desc' }],
				take: 3,
				select: {
					id: true,
					external_id: true,
					title: true,
					views: true,
					created_at: true,
					image_url: true,
					author: { select: AUTHOR_SELECT },
				},
			}),
			prisma.art.findMany({
				where: {
					created_at: { gte: since },
					...(authorId !== undefined && { author_id: authorId }),
				},
				orderBy: [{ views: 'desc' }, { created_at: 'desc' }],
				take: 3,
				select: {
					id: true,
					external_id: true,
					title: true,
					views: true,
					created_at: true,
					image_url: true,
					author: { select: AUTHOR_SELECT },
				},
			}),
			prisma.tierList.findMany({
				where: {
					kind: 'USER',
					is_public: true,
					created_at: { gte: since },
					...(authorId !== undefined && { author_id: authorId }),
				},
				orderBy: [{ created_at: 'desc' }],
				take: 3,
				select: {
					id: true,
					external_id: true,
					title: true,
					created_at: true,
					author: { select: AUTHOR_SELECT },
					_count: { select: { entries: true } },
				},
			}),
		])

		const candidates = [
			...builds.map((work) => ({
				kind: 'build' as const,
				work,
				popularity: work.views,
			})),
			...articles.map((work) => ({
				kind: 'article' as const,
				work,
				popularity: work.views,
			})),
			...arts.map((work) => ({
				kind: 'art' as const,
				work,
				popularity: work.views,
			})),
			...tierLists.map((work) => ({
				kind: 'tier_list' as const,
				work,
				popularity: work._count.entries,
			})),
		]

		return candidates
			.sort(
				(a, b) =>
					b.popularity - a.popularity ||
					b.work.created_at.getTime() - a.work.created_at.getTime()
			)
			.slice(0, 3)
			.map(({ kind, work, popularity }) => ({
				kind,
				id: work.id,
				external_id: work.external_id,
				title: work.title,
				views: 'views' in work ? work.views : 0,
				popularity,
				created_at: work.created_at,
				author: work.author,
				...('image_url' in work && { image_url: work.image_url }),
			}))
	}
}

export const authorsService = new AuthorsService()
