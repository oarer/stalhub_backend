import {
	buildEmbedFallback,
	extractImageLinks,
	extractVideoLinks,
	getUserProfileUrl,
} from './format'
import type { DevCommentRecord } from './store'

export function htmlToText(html: string): string {
	if (!html) return ''
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|blockquote|pre|li|ul|ol|h[1-6])>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.split('\n')
		.map((line) => line.replace(/[ \t]+/g, ' ').trim())
		.filter(Boolean)
		.join('\n')
}

export function buildCleanText(
	quotes: Array<{ author: string | null; html: string }>,
	responseHtml: string
): string {
	const parts: string[] = []
	for (const q of quotes) {
		const text = htmlToText(q.html)
		if (!text) continue
		parts.push(q.author ? `${q.author}:\n${text}` : text)
	}
	const responseText = htmlToText(responseHtml)
	if (responseText) parts.push(responseText)
	return parts.join('\n\n')
}

export interface FrontendQuote {
	author: string | null
	authorUrl: string | null
	html: string
	text: string
}

export interface FrontendDevComment {
	id: string
	author: {
		name: string
		profileUrl: string
	}
	link: string
	discussion: {
		slug: string | null
		postNumber: number | null
	}
	createdAt: string
	quotes: FrontendQuote[]
	response: {
		html: string
		text: string
	}
	text: string
	images: string[]
	videos: string[]
}

export function toFrontendItem(record: DevCommentRecord): FrontendDevComment {
	const quotes: FrontendQuote[] = (record.quotes ?? []).map((q) => ({
		author: q.author,
		authorUrl: q.author ? getUserProfileUrl(q.author) : null,
		html: q.html,
		text: htmlToText(q.html),
	}))

	let responseHtml = record.responseHtml
	let fallback: { html: string; videos: string[] } | null = null
	if (!responseHtml?.trim() && (record.quotes ?? []).length === 0) {
		fallback = buildEmbedFallback(record.contentHtml)
		if (fallback.html.trim()) responseHtml = fallback.html
	}
	const responseText = htmlToText(responseHtml)

	return {
		id: record.postId,
		author: {
			name: record.author,
			profileUrl: getUserProfileUrl(record.author),
		},
		link: record.link,
		discussion: {
			slug: record.slug,
			postNumber: record.postNumber,
		},
		createdAt: record.forumCreatedAt ?? record.checkedAt,
		quotes,
		response: {
			html: responseHtml,
			text: responseText,
		},
		text: buildCleanText(record.quotes ?? [], responseHtml),
		images: extractImageLinks(record.contentHtml),
		videos:
			fallback?.videos ?? extractVideoLinks(record.contentHtml),
	}
}

export interface FrontendFeed {
	items: FrontendDevComment[]
	total: number
	limit: number
	offset: number
	hasMore: boolean
	updatedAt: string
}

export function toFrontendFeed(
	records: DevCommentRecord[],
	total: number,
	limit: number,
	offset: number,
	updatedAt: string
): FrontendFeed {
	return {
		items: records.map(toFrontendItem),
		total,
		limit,
		offset,
		hasMore: offset + records.length < total,
		updatedAt,
	}
}
