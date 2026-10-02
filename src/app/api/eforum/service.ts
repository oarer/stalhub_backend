import { TRACKED_AUTHORS } from './authors'
import { cleanMessage, formatDevMessage } from './format'
import {
	DELAY_BETWEEN_AUTHORS_MS,
	fetchLastPost,
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
	postId: string,
	contentHtml: string,
	link: string,
	slug: string | null,
	postNumber: number | null,
	forumCreatedAt: string | null
): Promise<DevCommentRecord> {
	const formatted = await formatDevMessage(
		{ author, contentHtml, messageLink: link },
		(postId) => getPostWithDetails(postId)
	)

	const plain = cleanMessage(
		buildCleanText(formatted.quotes, formatted.responseHtml)
	)

	return {
		postId,
		author,
		link,
		slug,
		postNumber,
		forumCreatedAt,
		contentHtml,
		telegramHtml: formatted.telegramHtml,
		plainText: plain,
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
					const record = await buildRecord(
						author,
						fetched.postId,
						fetched.contentHtml,
						fetched.link,
						fetched.slug,
						fetched.postNumber,
						fetched.createdAt
					)
					const { isNew } = appendRecord(record)
					if (isNew) {
						newCount++
						newItems.push(record)
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
	return formatDevMessage({ author, contentHtml, messageLink: link }, (id) =>
		getPostWithDetails(id)
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
