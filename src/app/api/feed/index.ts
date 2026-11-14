import { t } from 'elysia'
import { fromStoreOpt, requireOptionalAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { type FeedItemType, feedService } from './feed.service'

const feedType = t.Union([
	t.Literal('build'),
	t.Literal('tier_list'),
	t.Literal('post'),
	t.Literal('art'),
	t.Literal('eforum'),
])

const parseTypesParam = (
	types?: string | string[] | undefined
): FeedItemType[] | undefined => {
	if (!types) return undefined
	const list = (Array.isArray(types) ? types : [types])
		.flatMap((entry) => entry.split(','))
		.map((entry) => entry.trim())
		.filter(Boolean) as FeedItemType[]
	if (list.length === 0) return undefined
	return [...new Set(list)]
}

export const feedRoutes = createElysia()
	.use(jwtPlugin)
	.get(
		'/feed',
		{
			beforeHandle: [requireOptionalAuth],
			query: t.Object({
				types: t.Optional(t.Array(feedType)),
				type: t.Optional(
					t.Union([
						t.Literal('all'),
						t.Literal('build'),
						t.Literal('tier_list'),
						t.Literal('post'),
						t.Literal('art'),
						t.Literal('eforum'),
					])
				),
				page: t.Optional(t.Numeric()),
				take: t.Optional(t.Numeric()),
				sort: t.Optional(t.Union([t.Literal('new'), t.Literal('top')])),
			}),
			detail: { tags: ['Feed'] },
		},
		async ({ query, store }) =>
			feedService.list({
				types:
					parseTypesParam(query.types) ??
					(!query.type || query.type === 'all'
						? undefined
						: [query.type]),
				page: Math.max(0, (query.page ?? 1) - 1),
				take: Math.min(100, Math.max(1, query.take ?? 24)),
				sort: query.sort ?? 'new',
				user_id: fromStoreOpt(store).user_id,
			})
	)
