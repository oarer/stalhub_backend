import { PostSource } from 'generated/prisma/client'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { TRACKED_AUTHORS } from './authors'
import { cleanMessage, extractImageLinks, formatDevMessage } from './format'
import {
	DELAY_BETWEEN_AUTHORS_MS,
	fetchLastPost,
	fetchUserByUsername,
	getPostWithDetails,
	pingForum,
	sleep,
} from './forum'
import { buildCleanText } from './present'
import {
	appendRecord,
	type DevCommentRecord,
	getLastIds,
	getStoreStatus,
	hasSeen,
	readHistory,
	setLastId,
} from './store'

const resolveForumUser = async (username: string) => {
	const user = await fetchUserByUsername(username)
	return user
		? { avatarUrl: user.avatarUrl, displayName: user.displayName }
		: null
}

let checkPromise: Promise<CheckResult> | null = null
let lastCheck: {
	startedAt: string
	finishedAt: string | null
	checked: number
	newCount: number
	errors: number
} | null = null

export interface CheckResult {
	checked: number
	newCount: number
	errors: number
	newItems: DevCommentRecord[]
}

async function buildRecord(
	author: string,
	post: Awaited<ReturnType<typeof fetchLastPost>>
): Promise<DevCommentRecord> {
	if (!post) throw new Error('post is empty')

	const formatted = await formatDevMessage(
		{
			author,
			contentHtml: post.contentHtml,
			messageLink: post.link,
			discussionTitle: post.discussionTitle,
			authorDisplayName: post.author?.displayName ?? null,
			authorAvatarUrl: post.author?.avatarUrl ?? null,
		},
		{
			loadOriginalPost: (postId) => getPostWithDetails(postId),
			resolveUser: resolveForumUser,
		}
	)

	const plain = cleanMessage(
		buildCleanText(formatted.quotes, formatted.responseHtml)
	)

	return {
		postId: post.postId,
		author,
		authorDisplayName: formatted.authorDisplayName,
		authorAvatarUrl: formatted.authorAvatarUrl,
		authorProfileUrl: formatted.authorProfileUrl,
		link: post.link,
		slug: post.slug,
		discussionTitle: post.discussionTitle,
		postNumber: post.postNumber,
		forumCreatedAt: post.createdAt,
		contentHtml: post.contentHtml,
		telegramHtml: formatted.telegramHtml,
		plainText: plain,
		blocks: formatted.blocks,
		quotes: formatted.quotes,
		responseHtml: formatted.responseHtml,
		checkedAt: new Date().toISOString(),
	}
}

export async function checkNewPosts(): Promise<CheckResult> {
	if (checkPromise) return checkPromise

	checkPromise = (async () => {
		const startedAt = new Date().toISOString()
		lastCheck = {
			startedAt,
			finishedAt: null,
			checked: 0,
			newCount: 0,
			errors: 0,
		}

		let checked = 0
		let newCount = 0
		let errors = 0
		const newItems: DevCommentRecord[] = []

		for (const author of TRACKED_AUTHORS) {
			try {
				const fetched = await fetchLastPost(author)
				checked++
				if (!fetched) continue

				if (hasSeen(author, fetched.postId)) continue

				try {
					const record = await buildRecord(author, fetched)
					const { isNew } = appendRecord(record)
					if (isNew) {
						newCount++
						newItems.push(record)
						if (env.EFORUM_FEED_MIRROR) {
							try {
								await prisma.post.create({
									data: {
										external_id: crypto
											.randomUUID()
											.slice(0, 8),
										content:
											record.plainText ||
											record.contentHtml,
										image_urls: extractImageLinks(
											record.contentHtml
										).filter(Boolean),
										source: PostSource.EFORUM,
										external_key: `eforum:${record.postId}`,
										author_name: record.author,
									},
								})
							} catch (mirrorError) {
								console.error(
									'[EForum] feed mirror failed:',
									mirrorError
								)
							}
						}
					}
				} catch (err) {
					errors++
					console.error(
						`[EForum] format/save failed for ${author}:`,
						err
					)

					setLastId(author, fetched.postId)
				}
			} catch (err) {
				errors++
				console.error(`[EForum] author ${author} failed:`, err)
			}

			await sleep(DELAY_BETWEEN_AUTHORS_MS)
		}

		const finishedAt = new Date().toISOString()
		lastCheck = { startedAt, finishedAt, checked, newCount, errors }

		console.log(
			`[EForum] check done: checked=${checked} new=${newCount} errors=${errors}` +
				(newItems.length > 0
					? ` :: ${newItems.map((i) => `${i.author}:${i.postId}`).join(', ')}`
					: '')
		)
		return { checked, newCount, errors, newItems }
	})()

	try {
		return await checkPromise
	} finally {
		checkPromise = null
	}
}

export async function previewMessage(
	author: string,
	contentHtml: string,
	link = ''
): Promise<Awaited<ReturnType<typeof formatDevMessage>>> {
	const user = await fetchUserByUsername(author).catch(() => null)
	return formatDevMessage(
		{
			author,
			contentHtml,
			messageLink: link,
			authorDisplayName: user?.displayName ?? null,
			authorAvatarUrl: user?.avatarUrl ?? null,
		},
		{
			loadOriginalPost: (postId) => getPostWithDetails(postId),
			resolveUser: resolveForumUser,
		}
	)
}

export function getStatus() {
	return {
		authors: TRACKED_AUTHORS.length,
		authorList: [...TRACKED_AUTHORS],
		lastCheck,
		store: getStoreStatus(),
		lastIds: getLastIds(),
		checkRunning: checkPromise !== null,
	}
}

export async function getPing() {
	return pingForum()
}

export { readHistory }
