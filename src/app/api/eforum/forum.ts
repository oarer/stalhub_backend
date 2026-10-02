import { env } from '@/env'

const API_URL = 'https://forum.exbo.net/api/posts'
const POST_URL = 'https://forum.exbo.net/api/posts'
const REQUEST_TIMEOUT_MS = 5_000
export const DELAY_BETWEEN_AUTHORS_MS = 500

function forumHeaders(): Record<string, string> {
	return {
		Accept: '*/*',
		'Accept-Language': 'ru,en;q=0.5',
		Connection: 'keep-alive',
		...(env.FORUM_COOKIE ? { Cookie: env.FORUM_COOKIE } : {}),
		'User-Agent': env.FORUM_USER_AGENT,
	}
}

export interface ForumLastPost {
	postId: string
	contentHtml: string
	link: string
	slug: string | null
	postNumber: number | null
	createdAt: string | null
	replyTo: string | null
}

interface FlarumPostsResponse {
	data: Array<{
		id: string | number
		attributes?: {
			contentHtml?: string
			number?: number
			createdAt?: string
			replyTo?: string | number | null
		}
		relationships?: {
			discussion?: { data?: { id?: string } }
			user?: { data?: { id?: string } }
		}
	}>
	included?: Array<{
		type?: string
		id?: string | number
		attributes?: { slug?: string; username?: string }
	}>
}

async function fetchWithTimeout(
	input: string,
	init: RequestInit,
	timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), timeoutMs)
	try {
		return await fetch(input, { ...init, signal: ctrl.signal })
	} finally {
		clearTimeout(timer)
	}
}

export async function fetchLastPost(
	author: string
): Promise<ForumLastPost | null> {
	const params = new URLSearchParams({
		'filter[author]': author,
		'filter[type]': 'comment',
		'page[limit]': '1',
		sort: '-createdAt',
		_: String(Math.floor(Date.now() / 1000)),
	})

	try {
		const res = await fetchWithTimeout(`${API_URL}?${params}`, {
			headers: forumHeaders(),
		})
		if (!res.ok) {
			console.error(`[EForum] API error for ${author}: ${res.status}`)
			return null
		}

		const data = (await res.json()) as FlarumPostsResponse
		const posts = data.data ?? []
		if (posts.length === 0) return null

		const post = posts[0]
		const postId = String(post.id)
		const attrs = post.attributes ?? {}
		const contentHtml = attrs.contentHtml ?? ''

		const discussionId = post.relationships?.discussion?.data?.id
		let slug: string | null = null
		for (const item of data.included ?? []) {
			if (
				item.type === 'discussions' &&
				String(item.id) === String(discussionId)
			) {
				slug = item.attributes?.slug ?? null
				break
			}
		}

		const postNumber = attrs.number ?? null
		let link = ''
		if (slug && postNumber) {
			link = `https://forum.exbo.net/d/${slug}/${postNumber}`
		}

		const replyTo =
			attrs.replyTo != null ? String(attrs.replyTo) : null
		if (replyTo) {
			await getPostWithDetails(replyTo).catch(() => null)
		}

		return {
			postId,
			contentHtml,
			link,
			slug,
			postNumber,
			createdAt: attrs.createdAt ?? null,
			replyTo,
		}
	} catch (err) {
		console.error(`[EForum] fetch failed for ${author}:`, err)
		return null
	}
}

export interface OriginalPost {
	content: string
	author: string | null
}

const originalPostsCache = new Map<string, OriginalPost>()

export function getOriginalPostCacheSize(): number {
	return originalPostsCache.size
}

export async function getPostWithDetails(
	postId: string
): Promise<OriginalPost | null> {
	const cached = originalPostsCache.get(postId)
	if (cached) return cached

	try {
		const res = await fetchWithTimeout(`${POST_URL}/${postId}`, {
			headers: forumHeaders(),
		})
		if (!res.ok) return null

		const data = (await res.json()) as {
			data?: {
				attributes?: { contentHtml?: string }
				relationships?: { user?: { data?: { id?: string } } }
			}
			included?: Array<{
				type?: string
				id?: string | number
				attributes?: { username?: string }
			}>
		}

		const postData = data.data ?? {}
		const contentHtml = postData.attributes?.contentHtml ?? ''
		const userId = postData.relationships?.user?.data?.id

		let authorName: string | null = null
		for (const item of data.included ?? []) {
			if (
				item.type === 'users' &&
				String(item.id) === String(userId)
			) {
				authorName = item.attributes?.username ?? null
				break
			}
		}

		const result = { content: contentHtml, author: authorName }
		originalPostsCache.set(postId, result)
		if (originalPostsCache.size > 500) {
			const first = originalPostsCache.keys().next().value
			if (first) originalPostsCache.delete(first)
		}
		return result
	} catch (err) {
		console.error(`[EForum] getPostWithDetails ${postId}:`, err)
		return null
	}
}

export async function pingForum(): Promise<{
	ok: boolean
	ms: number | null
	status: number | null
}> {
	try {
		const start = Date.now()
		const res = await fetchWithTimeout(
			'https://forum.exbo.net',
			{ headers: forumHeaders() },
			10_000
		)
		const ms = Date.now() - start
		return { ok: res.ok, ms, status: res.status }
	} catch {
		return { ok: false, ms: null, status: null }
	}
}

export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms))
