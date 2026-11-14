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
	for (const quote of quotes) {
		const text = htmlToText(quote.html)
		if (!text) continue
		parts.push(quote.author ? `${quote.author}:\n${text}` : text)
	}
	const responseText = htmlToText(responseHtml)
	if (responseText) parts.push(responseText)
	return parts.join('\n\n')
}

export interface FrontendAuthor {
	name: string
	displayName: string
	profileUrl: string
	avatarUrl: string | null
}

export interface FrontendQuote {
	author: string | null
	authorDisplayName: string | null
	authorUrl: string | null
	authorAvatarUrl: string | null
	link: string | null
	postId: string | null
	html: string
	text: string
}

export interface FrontendBlock {
	kind: 'text' | 'quote'
	html: string
	text: string
	quote: FrontendQuote | null
}

export interface FrontendDevComment {
	id: string
	author: FrontendAuthor
	link: string
	discussion: {
		slug: string | null
		title: string | null
		postNumber: number | null
	}
	createdAt: string
	quotes: FrontendQuote[]
	blocks: FrontendBlock[]
	response: {
		html: string
		text: string
	}
	text: string
	images: string[]
	videos: string[]
}

function toFrontendQuote(quote: {
	author: string | null
	authorDisplayName?: string | null
	authorUrl?: string | null
	authorAvatarUrl?: string | null
	link?: string | null
	postId?: string | null
	html: string
}): FrontendQuote {
	return {
		author: quote.author,
		authorDisplayName: quote.authorDisplayName ?? null,
		authorUrl: quote.author ? getUserProfileUrl(quote.author) : null,
		authorAvatarUrl: quote.authorAvatarUrl ?? null,
		link: quote.link ?? null,
		postId: quote.postId ?? null,
		html: quote.html,
		text: htmlToText(quote.html),
	}
}

export function toFrontendItem(record: DevCommentRecord): FrontendDevComment {
	const quotes: FrontendQuote[] = (record.quotes ?? []).map(toFrontendQuote)

	let responseHtml = record.responseHtml
	let fallback: { html: string; videos: string[]; images: string[] } | null =
		null
	if (!responseHtml?.trim() && (record.quotes ?? []).length === 0) {
		fallback = buildEmbedFallback(record.contentHtml)
		if (fallback.html.trim()) responseHtml = fallback.html
	}
	const responseText = htmlToText(responseHtml)

	const blocks: FrontendBlock[] = []
	if (record.blocks?.length) {
		for (const block of record.blocks) {
			if (block.kind === 'quote') {
				const quote = toFrontendQuote(block)
				blocks.push({
					kind: 'quote',
					html: quote.html,
					text: quote.text,
					quote,
				})
				continue
			}
			blocks.push({
				kind: 'text',
				html: block.html,
				text: htmlToText(block.html),
				quote: null,
			})
		}
	} else {
		for (const quote of quotes) {
			blocks.push({
				kind: 'quote',
				html: quote.html,
				text: quote.text,
				quote,
			})
		}
		if (responseText) {
			blocks.push({
				kind: 'text',
				html: responseHtml,
				text: responseText,
				quote: null,
			})
		}
	}

	return {
		id: record.postId,
		author: {
			name: record.author,
			displayName: record.authorDisplayName?.trim() || record.author,
			profileUrl:
				record.authorProfileUrl ?? getUserProfileUrl(record.author),
			avatarUrl: record.authorAvatarUrl ?? null,
		},
		link: record.link,
		discussion: {
			slug: record.slug,
			title: record.discussionTitle ?? null,
			postNumber: record.postNumber,
		},
		createdAt: record.forumCreatedAt ?? record.checkedAt,
		quotes,
		blocks,
		response: {
			html: responseHtml,
			text: responseText,
		},
		text: buildCleanText(record.quotes ?? [], responseHtml),
		images: extractImageLinks(record.contentHtml),
		videos: fallback?.videos ?? extractVideoLinks(record.contentHtml),
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
