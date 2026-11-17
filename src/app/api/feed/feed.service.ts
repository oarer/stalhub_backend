import { StarTargetType } from 'generated/prisma/client'
import { resolveArtAuthor } from '@/app/api/arts/art-author'
import { decompress } from '@/app/api/builds/builds.service'
import { postProjection } from '@/app/api/posts/posts.service'
import { prisma } from '@/lib/prisma'
import {
	AUTHOR_WITH_BADGES_SELECT,
	USER_BADGES_SELECT,
} from '@/utils/user-select'

const TOP_WINDOW_DAYS = 28

export type FeedType = 'all' | 'build' | 'tier_list' | 'post' | 'art' | 'eforum'
export type FeedItemType = Exclude<FeedType, 'all'>
export type FeedSort = 'new' | 'top'

const artAuthorInclude = {
	select: {
		id: true,
		name: true,
		username: true,
		social_links: true,
		badges: { select: USER_BADGES_SELECT },
	},
} as const

class FeedService {
	async list(opts: {
		types?: FeedItemType[]
		categories?: number[]
		page: number
		take: number
		sort: FeedSort
		user_id?: number
	}) {
		const cutoff = new Date(Date.now() - TOP_WINDOW_DAYS * 86400000)
		const dateWhere = opts.sort === 'top' ? { gte: cutoff } : undefined
		const includeAuthor = { select: AUTHOR_WITH_BADGES_SELECT } as const
		const wants = (type: FeedItemType) =>
			!opts.types || opts.types.includes(type)

		const wantsUserPosts = wants('post')
		const wantsEforumPosts = wants('eforum')
		const postSources: ('USER' | 'TG' | 'YOUTUBE' | 'EFORUM')[] = []
		if (wantsUserPosts) postSources.push('USER', 'TG', 'YOUTUBE')
		if (wantsEforumPosts) postSources.push('EFORUM')
		const categoryWhere = opts.categories?.length
			? {
					feed_source: {
						categories: {
							some: {
								category_id: { in: opts.categories },
							},
						},
					},
				}
			: {}

		const [builds, tierLists, posts, arts] = await Promise.all([
			wants('build')
				? prisma.build.findMany({
						where: {
							...(dateWhere && { created_at: dateWhere }),
							hidden_from_feed: false,
						},
						include: { author: includeAuthor },
					})
				: Promise.resolve([]),
			wants('tier_list')
				? prisma.tierList.findMany({
						where: {
							is_public: true,
							removed_at: null,
							hidden_from_feed: false,
							...(dateWhere && { created_at: dateWhere }),
						},
						include: {
							author: includeAuthor,
							_count: { select: { entries: true } },
							entries: {
								select: { item_id: true, rank: true },
								orderBy: { position: 'asc' },
								take: 60,
							},
						},
					})
				: Promise.resolve([]),
			postSources.length > 0
				? prisma.post.findMany({
						where: {
							...(dateWhere && { created_at: dateWhere }),
							source: { in: postSources },
							...categoryWhere,
						},
						include: { author: includeAuthor },
					})
				: Promise.resolve([]),
			wants('art')
				? prisma.art.findMany({
						where: dateWhere
							? { created_at: dateWhere }
							: undefined,
						include: { author: artAuthorInclude },
					})
				: Promise.resolve([]),
		])

		const artIds = arts.map((art) => art.id)
		const [artStarRows, artCommentRows] = artIds.length
			? await Promise.all([
					prisma.star.groupBy({
						by: ['target_id'],
						where: {
							target_type: StarTargetType.ART,
							target_id: { in: artIds },
						},
						_count: { target_id: true },
					}),
					prisma.articleComment.groupBy({
						by: ['art_id'],
						where: { art_id: { in: artIds } },
						_count: { art_id: true },
					}),
				])
			: [[], []]
		const artStars = new Map(
			artStarRows.map((row) => [row.target_id, row._count.target_id])
		)
		const artComments = new Map(
			artCommentRows.map((row) => [row.art_id, row._count.art_id])
		)

		const items = [
			...builds.map((build) => ({
				created_at: build.created_at,
				stars_count: build.stars_count,
				star_key: `${StarTargetType.BUILD}:${build.id}`,
				item: {
					type: 'build' as const,
					stars_count: build.stars_count,
					comments_count: build.comments_count,
					build: {
						id: build.id,
						external_id: build.external_id,
						title: build.title,
						data: decompress(build.data),
						flags: build.flags,
						tags: build.tags
							? build.tags.split(',').filter(Boolean)
							: [],
						views: build.views,
						author: build.author,
						stars_count: build.stars_count,
						comments_count: build.comments_count,
						hidden_from_feed: build.hidden_from_feed,
						created_at: build.created_at,
						updated_at: build.updated_at,
					},
				},
			})),
			...tierLists.map((tierList) => ({
				created_at: tierList.created_at,
				stars_count: tierList.stars_count,
				star_key: `${StarTargetType.TIER_LIST}:${tierList.id}`,
				item: {
					type: 'tier_list' as const,
					stars_count: tierList.stars_count,
					comments_count: tierList.comments_count,
					tier_list: {
						id: tierList.id,
						external_id: tierList.external_id,
						title: tierList.title,
						description: tierList.description,
						kind: tierList.kind,
						item_kind: tierList.item_kind,
						scenario: tierList.scenario,
						category: tierList.category,
						views: tierList.views,
						is_public: tierList.is_public,
						is_current: tierList.is_current,
						generated_at: tierList.generated_at,
						removed_at: tierList.removed_at,
						author: tierList.author,
						entry_count: tierList._count.entries,
						entries: tierList.entries.map((entry) => ({
							item_id: entry.item_id,
							rank: entry.rank,
						})),
						stars_count: tierList.stars_count,
						comments_count: tierList.comments_count,
						hidden_from_feed: tierList.hidden_from_feed,
						created_at: tierList.created_at,
						updated_at: tierList.updated_at,
					},
				},
			})),
			...(
				await Promise.all(
					posts.map(async (post) => {
						const projection = await postProjection(
							post.id,
							opts.user_id
						)
						if (!projection) return null
						const { is_starred: _isStarred, ...postData } =
							projection
						return {
							created_at: post.created_at,
							stars_count: post.stars_count,
							star_key: `${StarTargetType.POST}:${post.id}`,
							item: {
								type: 'post' as const,
								stars_count: post.stars_count,
								comments_count: post.comments_count,
								post: postData,
							},
						}
					})
				)
			).filter((entry) => entry !== null),
			...arts.map((art) => {
				const stars_count = artStars.get(art.id) ?? 0
				const comments_count = artComments.get(art.id) ?? 0
				const image_urls =
					art.image_urls.length > 0
						? art.image_urls
						: art.image_url
							? [art.image_url]
							: []
				return {
					created_at: art.created_at,
					stars_count,
					star_key: `${StarTargetType.ART}:${art.id}`,
					item: {
						type: 'art' as const,
						stars_count,
						comments_count,
						art: {
							id: art.id,
							external_id: art.external_id,
							type: art.type,
							title: art.title,
							description: art.description,
							image_url: art.image_url ?? image_urls[0] ?? null,
							image_urls,
							tags: art.tags
								? art.tags.split(',').filter(Boolean)
								: [],
							views: art.views,
							author: resolveArtAuthor(art),
							stars_count,
							comments_count,
							created_at: art.created_at,
							updated_at: art.updated_at,
						},
					},
				}
			}),
		]

		items.sort((a, b) =>
			opts.sort === 'top'
				? b.stars_count - a.stars_count ||
					b.created_at.getTime() - a.created_at.getTime()
				: b.created_at.getTime() - a.created_at.getTime()
		)

		const total_count = items.length
		const pageItems = items.slice(
			opts.page * opts.take,
			(opts.page + 1) * opts.take
		)
		let starred = new Set<string>()
		if (opts.user_id && pageItems.length) {
			const rows = await prisma.star.findMany({
				where: {
					user_id: opts.user_id,
					OR: pageItems.map((entry) => {
						const [target_type, id] = entry.star_key.split(':')
						return {
							target_type: target_type as StarTargetType,
							target_id: Number(id),
						}
					}),
				},
				select: { target_type: true, target_id: true },
			})
			starred = new Set(
				rows.map((row) => `${row.target_type}:${row.target_id}`)
			)
		}

		return {
			data: pageItems.map(({ item, star_key }) => ({
				...item,
				is_starred: starred.has(star_key),
			})),
			total_count,
			page: opts.page + 1,
			take: opts.take,
		}
	}
}

export const feedService = new FeedService()
