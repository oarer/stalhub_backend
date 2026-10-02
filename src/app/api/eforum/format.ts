export const MAX_MESSAGE_LENGTH = 4000

export interface ParsedQuote {
	author: string | null
	html: string
}

export interface ParsedMessage {
	quotes: ParsedQuote[]
	responseHtml: string
}

export function getUserProfileUrl(username: string): string {
	return `https://forum.exbo.net/u/${username}`
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

export function makeClickableUsername(username: string): string {
	const name = escapeHtml(username)
	return `<a href="${getUserProfileUrl(username)}">${name}</a>`
}

const ALLOWED_TAGS = new Set(['b', 'i', 'a', 'code', 'pre', 'blockquote'])

export function sanitizeHtml(htmlContent: string): string {
	if (!htmlContent) return ''

	let out = htmlContent
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')

	out = out.replace(
		/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g,
		(full, rawTag: string) => {
			const tag = String(rawTag).toLowerCase()
			const isClose = full.startsWith('</')
			if (!ALLOWED_TAGS.has(tag)) return ''
			if (tag === 'a' && !isClose) {
				const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
					full
				)
				const url = href?.[2] ?? href?.[3] ?? href?.[4] ?? ''

				if (/^\s*javascript:/i.test(url)) return ''
				return url ? `<a href="${escapeHtml(url)}">` : '<a>'
			}
			return isClose ? `</${tag}>` : `<${tag}>`
		}
	)
	return out
}

export function processImagesAndLinks(htmlContent: string): string {
	if (!htmlContent) return ''
	return htmlContent.replace(
		/<img\b[^>]*>/gi,
		(full) => {
			const srcMatch =
				/src\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(full)
			let src = srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? ''
			if (!src) return ''
			if (src.startsWith('//')) src = 'https:' + src
			else if (src.startsWith('/'))
				src = 'https://forum.exbo.net' + src
			return `<a href="${escapeHtml(src)}">фото</a>`
		}
	)
}

const JUNK_TAGS = [
	'script',
	'style',
	'svg',
	'button',
	'video',
	'audio',
	'iframe',
	'canvas',
	'form',
	'input',
	'select',
	'textarea',
	'noscript',
	'template',
	'embed',
	'object',
] as const

export function stripJunkSubtrees(htmlContent: string): string {
	if (!htmlContent) return ''
	const names = JUNK_TAGS.join('|')
	let out = htmlContent.replace(
		new RegExp(`<(${names})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'),
		''
	)

	out = out.replace(new RegExp(`<\\/?(${names})\\b[^>]*>`, 'gi'), '')
	return out
}

export function extractImageLinks(htmlContent: string): string[] {
	if (!htmlContent) return ['']
	const out: string[] = []
	const push = (raw: string) => {
		let src = (raw ?? '').trim()
		if (!src || src.startsWith('data:')) return
		if (src.startsWith('//')) src = 'https:' + src
		else if (src.startsWith('/')) src = 'https://forum.exbo.net' + src
		if (!/^https?:\/\//i.test(src)) return
		if (!out.includes(src)) out.push(src)
	}

	const attrRe =
		/<(?:img|video)\b[^>]*\b(?:src|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
	let m: RegExpExecArray | null
	while ((m = attrRe.exec(htmlContent)) !== null) {
		push(m[2] ?? m[3] ?? m[4] ?? '')
	}
	// превью YouTube, зашитое в style (s9e-эмбеды форума)
	const thumbRe = /https?:\/\/i\.ytimg\.com\/vi\/[\w-]+\/[\w.]+\.(?:jpg|webp)/gi
	let t: RegExpExecArray | null
	while ((t = thumbRe.exec(htmlContent)) !== null) {
		push(t[0])
	}
	return out
}

function toVideoUrl(raw: string): string | null {
	let u: URL
	try {
		u = new URL(raw, 'https://forum.exbo.net')
	} catch {
		return null
	}
	const host = u.hostname.replace(/^www\./, '').toLowerCase()

	if (host === 'youtube.com' || host === 'm.youtube.com') {
		const embed = /^\/embed\/([\w-]{6,})/.exec(u.pathname)
		if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`
		if (u.pathname === '/watch') {
			const v = u.searchParams.get('v')
			if (v) return `https://www.youtube.com/watch?v=${v}`
		}
		if (u.pathname.startsWith('/shorts/')) {
			const id = u.pathname.split('/')[2]
			if (id) return `https://www.youtube.com/watch?v=${id}`
		}
		return null
	}
	if (host === 'youtube-nocookie.com') {
		const embed = /^\/embed\/([\w-]{6,})/.exec(u.pathname)
		if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`
		return null
	}
	if (host === 'youtu.be') {
		const id = u.pathname.split('/').filter(Boolean)[0]
		if (id) return `https://youtu.be/${id}`
		return null
	}
	if (
		(host.endsWith('vk.com') || host.endsWith('vkvideo.ru')) &&
		u.pathname.startsWith('/video')
	) {
		return u.toString()
	}
	if (host.endsWith('rutube.ru') && u.pathname.startsWith('/video')) {
		return u.toString()
	}
	if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) {
		return u.toString()
	}
	if (
		host.endsWith('twitch.tv') &&
		(u.pathname.includes('/videos/') || u.pathname.includes('/clip/'))
	) {
		return u.toString()
	}
	if (host.endsWith('tiktok.com') && u.pathname.includes('/video/')) {
		return u.toString()
	}
	return null
}

/** Ссылки на видео из эмбедов (<iframe src>) и обычных ссылок. */
export function extractVideoLinks(htmlContent: string): string[] {
	if (!htmlContent) return ['']
	const out: string[] = []
	const push = (raw: string) => {
		const url = toVideoUrl(raw)
		if (url && !out.includes(url)) out.push(url)
	}
	const attrRe =
		/<(?:iframe|embed|video|source|a)\b[^>]*\b(?:src|href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
	let m: RegExpExecArray | null
	while ((m = attrRe.exec(htmlContent)) !== null) {
		push(m[2] ?? m[3] ?? m[4] ?? '')
	}
	return out
}

export interface EmbedFallback {
	html: string
	text: string
	videos: string[]
	images: string[]
}

/** Фолбэк для сообщений, состоящих только из эмбедов (видео/картинки без текста).
 * Гарантирует непустой ответ вместо пустых quotes/response. */
export function buildEmbedFallback(contentHtml: string): EmbedFallback {
	const videos = extractVideoLinks(contentHtml)
	const images = extractImageLinks(contentHtml)
	const htmlParts: string[] = []
	const textParts: string[] = []
	for (const v of videos) {
		const safe = escapeHtml(v)
		htmlParts.push(`🎬 Видео: <a href="${safe}">${safe}</a>`)
		textParts.push(`Видео: ${v}`)
	}
	for (const src of images) {
		const safe = escapeHtml(src)
		htmlParts.push(`<a href="${safe}">фото</a>`)
		textParts.push(`фото: ${src}`)
	}
	return {
		html: htmlParts.join('\n'),
		text: textParts.join('\n'),
		videos,
		images,
	}
}

export function processMentions(htmlContent: string): string {
	if (!htmlContent) return ''

	let out = htmlContent.replace(
		/<a\b([^>]*\bclass\s*=\s*["'][^"']*(?:PostMention|UserMention)[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi,
		(_full, _attrs, inner: string) => {
			const username = inner
				.replace(/<[^>]+>/g, '')
				.trim()
				.replace(/^@/, '')
			if (!username) return inner
			return `<a href="${getUserProfileUrl(username)}">@${escapeHtml(username)}</a>`
		}
	)

	const parts = out.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi)
	for (let i = 0; i < parts.length; i++) {
		if (/^<a\b/i.test(parts[i])) continue

		parts[i] = parts[i].replace(
			/(^|>)([^<>]*)/g,
			(full, prefix: string, text: string) => {
				const replaced = text.replace(
					/@([a-zA-Z0-9_]+)/g,
					(_m, user: string) =>
						`<a href="${getUserProfileUrl(user)}">@${user}</a>`
				)
				return prefix + replaced
			}
		)
	}
	return parts.join('')
}

function extractQuoteAuthor(blockquoteInner: string): string | null {
	const mention = /<a\b[^>]*\bclass\s*=\s*["'][^"']*(?:PostMention|UserMention)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(
		blockquoteInner
	)
	if (mention) {
		return mention[1].replace(/<[^>]+>/g, '').trim().replace(/^@/, '') || null
	}

	const cited = /<(cite|strong)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(blockquoteInner)
	if (cited) {
		return cited[2].replace(/<[^>]+>/g, '').trim() || null
	}
	return null
}

function stripFirstMentionCiteStrong(blockquoteInner: string): string {
	let out = blockquoteInner.replace(
		/<a\b[^>]*\bclass\s*=\s*["'][^"']*(?:PostMention|UserMention)[^"']*["'][^>]*>[\s\S]*?<\/a>/i,
		''
	)

	out = out.replace(/<(cite|strong)\b[^>]*>[\s\S]*?<\/\1>/i, '')
	return out
}

export function parseMessageContent(contentHtml: string): ParsedMessage {
	if (!contentHtml) return { quotes: [], responseHtml: '' }

	contentHtml = stripJunkSubtrees(contentHtml)

	const quotes: ParsedQuote[] = []

	const bqRe = /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi
	let response = contentHtml
	let m: RegExpExecArray | null

	const inners: string[] = []
	while ((m = bqRe.exec(contentHtml)) !== null) {
		inners.push(m[1])
	}
	for (const inner of inners) {
		const author = extractQuoteAuthor(inner)
		let quoteHtml = stripFirstMentionCiteStrong(inner)
		quoteHtml = stripJunkSubtrees(quoteHtml)
		quoteHtml = processImagesAndLinks(quoteHtml)
		quoteHtml = processMentions(quoteHtml)
		quoteHtml = sanitizeHtml(quoteHtml)
		if (quoteHtml && quoteHtml.trim()) {
			quotes.push({ author, html: quoteHtml })
		}
	}
	response = contentHtml.replace(bqRe, '')

	response = processImagesAndLinks(response)
	response = processMentions(response)
	response = sanitizeHtml(response)

	return { quotes, responseHtml: response }
}

export function getOriginalPostIdFromMention(
	contentHtml: string
): string | null {
	if (!contentHtml) return null
	const m = /<a\b[^>]*\bclass\s*=\s*["'][^"']*PostMention[^"']*["'][^>]*>/i.exec(
		contentHtml
	)
	if (!m) return null
	const idMatch =
		/data-id\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[0])
	return idMatch?.[2] ?? idMatch?.[3] ?? idMatch?.[4] ?? null
}

function removeFirstPostMention(htmlContent: string): string {
	return htmlContent.replace(
		/<a\b[^>]*\bclass\s*=\s*["'][^"']*PostMention[^"']*["'][^>]*>[\s\S]*?<\/a>/i,
		''
	)
}

function stripTags(s: string): string {
	return s.replace(/<[^>]+>/g, '')
}

export function cleanMessage(message: string): string {
	return message.replace(/\n+$/, '').trimEnd()
}

export interface FormatInput {
	author: string
	contentHtml: string
	messageLink: string
}

export interface FormatOutput extends ParsedMessage {
	author: string
	authorLink: string
	messageLink: string
	telegramHtml: string
}

export type OriginalPostLoader = (
	postId: string
) => Promise<{ content: string; author: string | null } | null>

export async function formatDevMessage(
	input: FormatInput,
	loadOriginal?: OriginalPostLoader
): Promise<FormatOutput> {
	const { author, contentHtml, messageLink } = input
	const authorLink = makeClickableUsername(author)

	let { quotes, responseHtml } = parseMessageContent(contentHtml)

	if (quotes.length === 0 && loadOriginal) {
		const originalPostId = getOriginalPostIdFromMention(contentHtml)
		if (originalPostId) {
			const original = await loadOriginal(originalPostId)
			if (original?.content) {
				let originalHtml = stripJunkSubtrees(original.content)
				originalHtml = processImagesAndLinks(originalHtml)
				originalHtml = processMentions(originalHtml)
				originalHtml = sanitizeHtml(originalHtml)
				if (originalHtml && originalHtml.trim()) {
					quotes.push({
						author: original.author,
						html: originalHtml,
					})
				}
				const withoutMention = removeFirstPostMention(contentHtml)
				responseHtml = sanitizeHtml(
					processMentions(
						processImagesAndLinks(stripJunkSubtrees(withoutMention))
					)
				)
			}
		}
	}

	const parts = [`<b>🔔 Новый комментарий от ${authorLink}</b>`]

	for (const quote of quotes) {
		const header = quote.author
			? `<b> ${escapeHtml(quote.author)} написал:</b>`
			: '<b> Пользователь написал:</b>'
		if (quote.html && quote.html.trim()) {
			parts.push(
				`${header}\n<blockquote expandable>${quote.html}</blockquote>`
			)
		}
	}

	if (responseHtml && responseHtml.trim()) {
		if (quotes.length > 0) {
			parts.push(
				`<b> ${authorLink} ответил:</b>\n<blockquote expandable>${responseHtml}</blockquote>`
			)
		} else {
			parts.push(
				`<b> ${authorLink} написал:</b>\n<blockquote expandable>${responseHtml}</blockquote>`
			)
		}
	}

	if (quotes.length === 0 && (!responseHtml || !responseHtml.trim())) {
		const plain = sanitizeHtml(
			processMentions(
				processImagesAndLinks(stripJunkSubtrees(contentHtml))
			)
		)
		if (plain && plain.trim()) {
			parts.push(
				`<b> ${authorLink} написал:</b>\n<blockquote expandable>${plain}</blockquote>`
			)
		} else {

			const fb = buildEmbedFallback(contentHtml)
			if (fb.html.trim()) {
				responseHtml = fb.html
				parts.push(
					`<b> ${authorLink} прикрепил:</b>\n<blockquote expandable>${fb.html}</blockquote>`
				)
			}
		}
	}

	parts.push(`#${author}\n🔗 <a href="${messageLink}">Ссылка на сообщение</a>`)

	const filtered = parts
		.filter((p) => p && p.trim())
		.map((p) => p.replace(/\n{2,}/g, '\n'))
	let finalMessage = cleanMessage(filtered.join('\n\n'))
	finalMessage = finalMessage.replace(/\n{3,}/g, '\n\n')

	return {
		author,
		authorLink,
		messageLink,
		quotes,
		responseHtml,
		telegramHtml: finalMessage,
	}
}

export function toPlainFallback(telegramHtml: string): string {
	return stripTags(telegramHtml)
}
