import { env } from '@/env'
import type { OriginalPost } from './format'

const API_URL = 'https://forum.exbo.net/api/posts'
const POST_URL = 'https://forum.exbo.net/api/posts'
const USERS_URL = 'https://forum.exbo.net/api/users'
const REQUEST_TIMEOUT_MS = 5_000
export const DELAY_BETWEEN_AUTHORS_MS = 500

const USER_CACHE_TTL_MS = 10 * 60 * 1000
const USER_CACHE_MAX = 2_000

function forumHeaders(): Record<string, string> {
	return {
		Accept: '*/*',
		'Accept-Language': 'ru,en;q=0.5',
		Connection: 'keep-alive',
		...(env.FORUM_COOKIE ? { Cookie: env.FORUM_COOKIE } : {}),
		'User-Agent': env.FORUM_USER_AGENT,
	}
}

export interface ForumUser {
	id: string | null
	username: string | null
	displayName: string | null
	avatarUrl: string | null
	slug: string | null
}

interface FlarumUserAttributes {
	username?: string
	displayName?: string
	avatarUrl?: string | null
	slug?: string
}

interface FlarumPostResource {
	id: string | number
	attributes?: {
		contentHtml?: string
		number?: number
		createdAt?: string
		likesCount?: number
		replyTo?: string | number | null
	}
	relationships?: {
		discussion?: { data?: { id?: string } }
		user?: { data?: { id?: string } }
	}
}

interface FlarumDocument {
	data?: FlarumPostResource | FlarumPostResource[]
	included?: Array<{
		type?: string
		id?: string | number
		attributes?: FlarumUserAttributes & { slug?: string; title?: string }
	}>
}

export interface ForumLastPost {
	postId: string
	contentHtml: string
	link: string
	slug: string | null
	discussionTitle: string | null
	postNumber: number | null
	createdAt: string | null
	author: ForumUser | null
}

function toForumUser(
	id: string | null,
	attributes: FlarumUserAttributes | undefined
): ForumUser | null {
	if (!attributes) return null
	return {
		id,
		username: attributes.username ?? null,
		displayName: attributes.displayName ?? attributes.username ?? null,
		avatarUrl: attributes.avatarUrl ?? null,
		slug: attributes.slug ?? attributes.username ?? null,
	}
}

function findUser(
	included: FlarumDocument['included'],
	userId: string | undefined
): ForumUser | null {
	if (!userId) return null
	for (const item of included ?? []) {
		if (item.type !== 'users') continue
		if (String(item.id) !== userId) continue
		return toForumUser(String(item.id), item.attributes)
	}
	return null
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

// ------------------------------------------------------------ user lookups

interface UserCacheEntry {
	value: ForumUser | null
	expiresAt: number
}

const userCache = new Map<string, UserCacheEntry>()

function readUserCache(key: string): ForumUser | null | undefined {
	const entry = userCache.get(key)
	if (!entry) return undefined
	if (entry.expiresAt < Date.now()) {
		userCache.delete(key)
		return undefined
	}
	return entry.value
}

function writeUserCache(key: string, value: ForumUser | null): void {
	if (userCache.size >= USER_CACHE_MAX) {
		const oldest = userCache.keys().next().value
		if (oldest) userCache.delete(oldest)
	}
	userCache.set(key, { value, expiresAt: Date.now() + USER_CACHE_TTL_MS })
}

export async function fetchUserById(userId: string): Promise<ForumUser | null> {
	const key = `id:${userId}`
	const cached = readUserCache(key)
	if (cached !== undefined) return cached

	try {
		const res = await fetchWithTimeout(`${USERS_URL}/${userId}`, {
			headers: forumHeaders(),
		})
		if (!res.ok) {
			if (res.status === 404) writeUserCache(key, null)
			return null
		}
		const data = (await res.json()) as {
			data?: { id?: string | number; attributes?: FlarumUserAttributes }
		}
		const user = data.data
			? toForumUser(
					data.data.id != null ? String(data.data.id) : null,
					data.data.attributes
				)
			: null
		writeUserCache(key, user)
		if (user?.username) writeUserCache(`name:${user.username}`, user)
		return user
	} catch (err) {
		console.error(`[EForum] fetchUserById ${userId}:`, err)
		return null
	}
}

export async function fetchUserByUsername(
	username: string
): Promise<ForumUser | null> {
	const name = username.trim()
	if (!name) return null
	const key = `name:${name}`
	const cached = readUserCache(key)
	if (cached !== undefined) return cached

	try {
		const url = `${USERS_URL}/${encodeURIComponent(name)}?bySlug=1`
		const res = await fetchWithTimeout(url, { headers: forumHeaders() })
		if (!res.ok) {
			if (res.status === 404) writeUserCache(key, null)
			return null
		}
		const data = (await res.json()) as {
			data?: { id?: string | number; attributes?: FlarumUserAttributes }
		}
		const user = data.data
			? toForumUser(
					data.data.id != null ? String(data.data.id) : null,
					data.data.attributes
				)
			: null
		writeUserCache(key, user)
		if (user?.id) writeUserCache(`id:${user.id}`, user)
		return user
	} catch (err) {
		console.error(`[EForum] fetchUserByUsername ${name}:`, err)
		return null
	}
}

// ------------------------------------------------------------ posts

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

		const data = (await res.json()) as FlarumDocument
		const posts = Array.isArray(data.data)
			? data.data
			: data.data
				? [data.data]
				: []
		if (posts.length === 0) return null

		const post = posts[0]
		const attrs = post.attributes ?? {}
		const discussionId = post.relationships?.discussion?.data?.id
		const authorId = post.relationships?.user?.data?.id

		let slug: string | null = null
		let discussionTitle: string | null = null
		for (const item of data.included ?? []) {
			if (
				item.type === 'discussions' &&
				String(item.id) === String(discussionId)
			) {
				slug = item.attributes?.slug ?? null
				discussionTitle = item.attributes?.title?.trim() ?? null
				break
			}
		}

		const postNumber = attrs.number ?? null
		const link =
			slug && postNumber
				? `https://forum.exbo.net/d/${slug}/${postNumber}`
				: ''

		let forumUser = findUser(
			data.included,
			authorId ? String(authorId) : undefined
		)

		// API не всегда отдаёт автора в included — добираем отдельным запросом.
		if (!forumUser && authorId) {
			forumUser = await fetchUserById(String(authorId)).catch(() => null)
		}
		if (!forumUser) {
			forumUser = await fetchUserByUsername(author).catch(() => null)
		}

		return {
			postId: String(post.id),
			contentHtml: attrs.contentHtml ?? '',
			link,
			slug,
			discussionTitle,
			postNumber,
			createdAt: attrs.createdAt ?? null,
			author: forumUser,
		}
	} catch (err) {
		console.error(`[EForum] fetch failed for ${author}:`, err)
		return null
	}
}

export function getOriginalPostCacheSize(): number {
	return originalPostsCache.size
}

const originalPostsCache = new Map<string, OriginalPost>()

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

		const data = (await res.json()) as FlarumDocument
		const postData = Array.isArray(data.data) ? data.data[0] : data.data
		if (!postData) return null

		const contentHtml = postData.attributes?.contentHtml ?? ''
		const authorId = postData.relationships?.user?.data?.id
		const author = findUser(
			data.included,
			authorId ? String(authorId) : undefined
		)

		const result: OriginalPost = {
			content: contentHtml,
			author: author?.username ?? null,
			authorDisplayName: author?.displayName ?? null,
			avatarUrl: author?.avatarUrl ?? null,
		}
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
