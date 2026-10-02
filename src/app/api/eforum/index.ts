import { t } from 'elysia'
import { createElysia } from '@/utils/elysia'
import { TRACKED_AUTHORS } from './authors'
import { toFrontendFeed, toFrontendItem } from './present'
import {
	checkNewPosts,
	getPing,
	getStatus,
	previewMessage,
	readHistory,
} from './service'
import { findByPostId } from './store'

const parseAuthorsParam = (
	author?: string,
	authors?: string | string[]
): string[] | undefined => {
	const list: string[] = []
	if (author) list.push(author)
	if (authors) {
		const arr = Array.isArray(authors) ? authors : [authors]
		for (const entry of arr) {
			for (const name of entry.split(',')) {
				const trimmed = name.trim()
				if (trimmed) list.push(trimmed)
			}
		}
	}
	return list.length > 0 ? [...new Set(list)] : undefined
}

export const eforumRoutes = createElysia().group('/eforum', (app) =>
	app
		.get(
			'/latest',
			async ({ query }) => {
				if (query.refresh) {
					await checkNewPosts()
				}
				const limit = query.limit ?? 20
				const offset = query.offset ?? 0
				const { items, total, updatedAt } = readHistory({
					authors: parseAuthorsParam(query.author, query.authors),
					limit,
					offset,
					since: query.since,
				})
				return {
					...toFrontendFeed(items, total, limit, offset, updatedAt),
					lastCheck: getStatus().lastCheck,
				}
			},
			{
				query: t.Object({
					author: t.Optional(t.String()),
					authors: t.Optional(
						t.Union([t.String(), t.Array(t.String())])
					),
					limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
					offset: t.Optional(t.Numeric({ minimum: 0 })),
					since: t.Optional(t.String()),
					refresh: t.Optional(t.BooleanString()),
				}),
				detail: { tags: ['EForum'] },
			}
		)
		.get(
			'/post/:postId',
			async ({ params, set }) => {
				const found = findByPostId(params.postId)
				if (!found) {
					set.status = 404
					return { error: 'Post not found in history' }
				}
				return toFrontendItem(found)
			},
			{
				params: t.Object({ postId: t.String() }),
				detail: { tags: ['EForum'] },
			}
		)
		.get(
			'/authors',
			() => ({
				total: TRACKED_AUTHORS.length,
				authors: [...TRACKED_AUTHORS].map((name) => ({
					name,
					profileUrl: `https://forum.exbo.net/u/${name}`,
				})),
			}),
			{
				detail: { tags: ['EForum'] },
			}
		)
		.get('/status', () => getStatus(), {
			detail: { tags: ['EForum'] },
		})
		.get('/ping', async () => getPing(), {
			detail: { tags: ['EForum'] },
		})

		.post(
			'/preview',
			async ({ body }) => {
				const formatted = await previewMessage(
					body.author,
					body.contentHtml,
					body.link ?? ''
				)
				return toFrontendItem({
					postId: 'preview',
					author: body.author,
					link: body.link ?? '',
					slug: null,
					postNumber: null,
					forumCreatedAt: new Date().toISOString(),
					contentHtml: body.contentHtml,
					telegramHtml: formatted.telegramHtml,
					plainText: '',
					quotes: formatted.quotes,
					responseHtml: formatted.responseHtml,
					checkedAt: new Date().toISOString(),
				})
			},
			{
				body: t.Object({
					author: t.String({ minLength: 1 }),
					contentHtml: t.String(),
					link: t.Optional(t.String()),
				}),
				detail: { tags: ['EForum'] },
			}
		)
)
