import { t } from 'elysia'
import { createElysia } from '@/utils/elysia'
import { TRACKED_AUTHORS } from './authors'
import { getUserProfileUrl } from './format'
import { fetchUserByUsername } from './forum'
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
			},
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
			}
		)
		.get(
			'/post/:postId',
			{
				params: t.Object({ postId: t.String() }),
				detail: { tags: ['EForum'] },
			},
			async ({ params, set }) => {
				const found = findByPostId(params.postId)
				if (!found) {
					set.status = 404
					return { error: 'Post not found in history' }
				}
				return toFrontendItem(found)
			}
		)
		.get(
			'/authors',
			{
				detail: { tags: ['EForum'] },
			},
			async () => {
				const authors = [...TRACKED_AUTHORS]
				const result: Array<{
					name: string
					displayName: string
					profileUrl: string
					avatarUrl: string | null
				}> = []
				// Ограничиваем параллелизм, чтобы не бомбить форум 55 запросами.
				for (let i = 0; i < authors.length; i += 5) {
					const chunk = authors.slice(i, i + 5)
					const resolved = await Promise.all(
						chunk.map(async (name) => {
							const user = await fetchUserByUsername(name).catch(
								() => null
							)
							return {
								name,
								displayName: user?.displayName ?? name,
								profileUrl: getUserProfileUrl(name),
								avatarUrl: user?.avatarUrl ?? null,
							}
						})
					)
					result.push(...resolved)
				}
				return { total: authors.length, authors: result }
			}
		)
		.get(
			'/status',
			{
				detail: { tags: ['EForum'] },
			},
			() => getStatus()
		)
		.get(
			'/ping',
			{
				detail: { tags: ['EForum'] },
			},
			async () => getPing()
		)

		.post(
			'/preview',
			{
				body: t.Object({
					author: t.String({ minLength: 1 }),
					contentHtml: t.String(),
					link: t.Optional(t.String()),
				}),
				detail: { tags: ['EForum'] },
			},
			async ({ body }) => {
				const formatted = await previewMessage(
					body.author,
					body.contentHtml,
					body.link ?? ''
				)
				return toFrontendItem({
					postId: 'preview',
					author: body.author,
					authorDisplayName: formatted.authorDisplayName,
					authorAvatarUrl: formatted.authorAvatarUrl,
					authorProfileUrl: formatted.authorProfileUrl,
					link: body.link ?? '',
					slug: null,
					discussionTitle: null,
					postNumber: null,
					forumCreatedAt: new Date().toISOString(),
					contentHtml: body.contentHtml,
					telegramHtml: formatted.telegramHtml,
					plainText: '',
					blocks: formatted.blocks,
					quotes: formatted.quotes,
					responseHtml: formatted.responseHtml,
					checkedAt: new Date().toISOString(),
				})
			}
		)
)
