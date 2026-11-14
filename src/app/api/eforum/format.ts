export const MAX_MESSAGE_LENGTH = 4000
export const FORUM_BASE_URL = 'https://forum.exbo.net'

export interface ParsedQuote {
	author: string | null
	authorDisplayName: string | null
	authorUrl: string | null
	authorAvatarUrl: string | null
	link: string | null
	postId: string | null
	html: string
}

export type MessageBlock =
	| { kind: 'text'; html: string }
	| ({ kind: 'quote' } & ParsedQuote)

export interface QuoteReference {
	postId: string | null
	author: string | null
	authorDisplayName: string | null
	link: string | null
}

export interface ParsedMessage {
	blocks: MessageBlock[]
	quotes: ParsedQuote[]
	responseHtml: string
	reply: QuoteReference | null
}

export function getUserProfileUrl(username: string): string {
	return `${FORUM_BASE_URL}/u/${username}`
}

// ---------------------------------------------------------------- entities

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	laquo: '«',
	raquo: '»',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	copy: '©',
	reg: '®',
	trade: '™',
	deg: '°',
	times: '×',
	middot: '·',
	bull: '•',
}

function decodeEntities(value: string): string {
	if (!value.includes('&')) return value
	return value.replace(
		/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
		(full, body: string) => {
			if (body.startsWith('#')) {
				const hex = body[1] === 'x' || body[1] === 'X'
				const code = Number.parseInt(
					hex ? body.slice(2) : body.slice(1),
					hex ? 16 : 10
				)
				if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
					return full
				}
				try {
					return String.fromCodePoint(code)
				} catch {
					return full
				}
			}
			return NAMED_ENTITIES[body.toLowerCase()] ?? full
		}
	)
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
	return escapeHtml(value).replace(/"/g, '&quot;')
}

function absolutize(raw: string | undefined | null): string | null {
	if (!raw) return null
	const value = raw.trim()
	if (
		!value ||
		value.startsWith('data:') ||
		value.startsWith('javascript:')
	) {
		return null
	}
	if (value.startsWith('//')) return `https:${value}`
	if (value.startsWith('/')) return `${FORUM_BASE_URL}${value}`
	if (/^https?:\/\//i.test(value)) return value
	return null
}

// ---------------------------------------------------------------- parser

interface TextNode {
	kind: 'text'
	value: string
}

interface ElementNode {
	kind: 'element'
	tag: string
	attrs: Record<string, string>
	children: HtmlNode[]
}

type HtmlNode = TextNode | ElementNode

const VOID_TAGS = new Set([
	'br',
	'img',
	'hr',
	'input',
	'meta',
	'link',
	'source',
	'wbr',
	'embed',
	'iframe',
	'param',
	'area',
	'col',
	'track',
])

const CONTAINER_TAGS = new Set([
	'div',
	'section',
	'article',
	'header',
	'footer',
	'aside',
	'figure',
	'figcaption',
	'main',
	'details',
])

const SKIPPED_TAGS = new Set([
	'script',
	'style',
	'svg',
	'button',
	'canvas',
	'form',
	'input',
	'select',
	'textarea',
	'noscript',
	'template',
	'object',
	'applet',
])

const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g

function parseAttrs(raw: string): Record<string, string> {
	const attrs: Record<string, string> = {}
	if (!raw.trim()) return attrs
	ATTR_RE.lastIndex = 0
	let match: RegExpExecArray | null
	while ((match = ATTR_RE.exec(raw)) !== null) {
		const name = match[1]?.toLowerCase()
		if (!name) continue
		const value = match[3] ?? match[4] ?? match[5] ?? ''
		attrs[name] = decodeEntities(value)
	}
	return attrs
}

function parseHtml(html: string): HtmlNode[] {
	const root: ElementNode = {
		kind: 'element',
		tag: '#root',
		attrs: {},
		children: [],
	}
	const stack: ElementNode[] = [root]
	const pushText = (value: string) => {
		if (value)
			stack[stack.length - 1].children.push({ kind: 'text', value })
	}

	let index = 0
	while (index < html.length) {
		const lt = html.indexOf('<', index)
		if (lt === -1) {
			pushText(html.slice(index))
			break
		}
		if (lt > index) pushText(html.slice(index, lt))

		if (html.startsWith('<!--', lt)) {
			const end = html.indexOf('-->', lt + 4)
			index = end === -1 ? html.length : end + 3
			continue
		}
		if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
			const end = html.indexOf('>', lt)
			index = end === -1 ? html.length : end + 1
			continue
		}

		const gt = html.indexOf('>', lt)
		if (gt === -1) {
			pushText(html.slice(lt))
			break
		}
		const raw = html.slice(lt + 1, gt)
		index = gt + 1

		if (raw.startsWith('/')) {
			const tag = raw.slice(1).trim().toLowerCase()
			for (let depth = stack.length - 1; depth > 0; depth--) {
				if (stack[depth].tag === tag) {
					stack.length = depth
					break
				}
			}
			continue
		}

		const selfClosing = raw.endsWith('/')
		const body = selfClosing ? raw.slice(0, -1) : raw
		const match = /^([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*)$/.exec(body)
		if (!match) continue
		const tag = match[1].toLowerCase()
		const element: ElementNode = {
			kind: 'element',
			tag,
			attrs: parseAttrs(match[2] ?? ''),
			children: [],
		}
		stack[stack.length - 1].children.push(element)
		if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(element)
	}
	return root.children
}

// ---------------------------------------------------------------- render

interface RenderContext {
	pre: boolean
}

const DEFAULT_CONTEXT: RenderContext = { pre: false }

function classList(node: ElementNode): string {
	return node.attrs.class ?? ''
}

function nodeText(node: HtmlNode): string {
	if (node.kind === 'text') return decodeEntities(node.value)
	let out = ''
	for (const child of node.children) out += nodeText(child)
	return out
}

function findFirst(
	nodes: HtmlNode[],
	predicate: (node: ElementNode) => boolean
): ElementNode | null {
	for (const node of nodes) {
		if (node.kind !== 'element') continue
		if (predicate(node)) return node
		const nested = findFirst(node.children, predicate)
		if (nested) return nested
	}
	return null
}

function isMention(node: ElementNode): boolean {
	return (
		node.tag === 'a' &&
		/(?:^|\s)(PostMention|UserMention)(?:\s|$)/.test(classList(node))
	)
}

/** Только PostMention означает ответ на конкретное сообщение; UserMention — просто упоминание. */
function isReplyMention(node: ElementNode): boolean {
	return (
		node.tag === 'a' && /(?:^|\s)PostMention(?:\s|$)/.test(classList(node))
	)
}

function toVideoUrl(raw: string): string | null {
	let url: URL
	try {
		url = new URL(raw, FORUM_BASE_URL)
	} catch {
		return null
	}
	const host = url.hostname.replace(/^www\./, '').toLowerCase()

	if (host === 'youtube.com' || host === 'm.youtube.com') {
		const embed = /^\/embed\/([\w-]{6,})/.exec(url.pathname)
		if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`
		if (url.pathname === '/watch') {
			const video = url.searchParams.get('v')
			if (video) return `https://www.youtube.com/watch?v=${video}`
		}
		if (url.pathname.startsWith('/shorts/')) {
			const id = url.pathname.split('/')[2]
			if (id) return `https://www.youtube.com/watch?v=${id}`
		}
		return null
	}
	if (host === 'youtube-nocookie.com') {
		const embed = /^\/embed\/([\w-]{6,})/.exec(url.pathname)
		if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`
		return null
	}
	if (host === 'youtu.be') {
		const id = url.pathname.split('/').filter(Boolean)[0]
		if (id) return `https://youtu.be/${id}`
		return null
	}
	if (
		(host.endsWith('vk.com') || host.endsWith('vkvideo.ru')) &&
		url.pathname.startsWith('/video')
	) {
		return url.toString()
	}
	if (host.endsWith('rutube.ru') && url.pathname.startsWith('/video')) {
		return url.toString()
	}
	if (host === 'vimeo.com' && /^\/\d+/.test(url.pathname)) {
		return url.toString()
	}
	if (
		host.endsWith('twitch.tv') &&
		(url.pathname.includes('/videos/') || url.pathname.includes('/clip/'))
	) {
		return url.toString()
	}
	if (host.endsWith('tiktok.com') && url.pathname.includes('/video/')) {
		return url.toString()
	}
	return null
}

function mediaSrc(node: ElementNode): string | null {
	const direct = absolutize(node.attrs.src) ?? absolutize(node.attrs.poster)
	if (direct) return direct
	for (const child of node.children) {
		if (child.kind !== 'element') continue
		if (child.tag !== 'source' && child.tag !== 'track') continue
		const src = absolutize(child.attrs.src)
		if (src) return src
	}
	return null
}

function renderText(node: TextNode, context: RenderContext): string {
	let text = decodeEntities(node.value)
	if (!context.pre) text = text.replace(/\s+/g, ' ')
	return escapeHtml(text)
}

function renderInline(
	nodes: HtmlNode[],
	skip: Set<HtmlNode>,
	context: RenderContext
): string {
	let out = ''
	for (const node of nodes) {
		if (skip.has(node)) continue
		if (node.kind === 'text') {
			out += renderText(node, context)
			continue
		}
		out += renderInlineElement(node, skip, context)
	}
	return out
}

function renderInlineElement(
	node: ElementNode,
	skip: Set<HtmlNode>,
	context: RenderContext
): string {
	if (SKIPPED_TAGS.has(node.tag)) return ''
	const classes = classList(node)
	const inner = () => renderInline(node.children, skip, context)

	switch (node.tag) {
		case 'br':
			return '\n'
		case 'b':
		case 'strong': {
			const value = inner()
			return value.trim() ? `<b>${value}</b>` : value
		}
		case 'i':
		case 'em': {
			if (/\bicon\b/.test(classes)) return ''
			const value = inner()
			return value.trim() ? `<i>${value}</i>` : value
		}
		case 'u':
		case 'ins': {
			const value = inner()
			return value.trim() ? `<u>${value}</u>` : value
		}
		case 's':
		case 'del':
		case 'strike': {
			const value = inner()
			return value.trim() ? `<s>${value}</s>` : value
		}
		case 'code': {
			const value = renderInline(node.children, skip, { pre: true })
			return value.trim() ? `<code>${value.trim()}</code>` : ''
		}
		case 'pre': {
			const value = renderInline(node.children, skip, {
				pre: true,
			}).trim()
			return value ? `<pre>${value}</pre>` : ''
		}
		case 'a': {
			if (isMention(node)) {
				const reference = mentionReference(node)
				if (!reference?.author) return ''
				const visible = reference.authorDisplayName ?? reference.author
				return `<a href="${escapeAttr(getUserProfileUrl(reference.author))}">@${escapeHtml(visible)}</a>`
			}
			const value = inner()
			const href = absolutize(node.attrs.href)
			if (!value.trim() || !href) return value
			if (value.trimStart().startsWith('<a ')) return value
			return `<a href="${escapeAttr(href)}">${value}</a>`
		}
		case 'img': {
			if (/\bemoji\b/.test(classes)) {
				return escapeHtml(decodeEntities(node.attrs.alt ?? '').trim())
			}
			const src = absolutize(node.attrs.src)
			return src ? `<a href="${escapeAttr(src)}">фото</a>` : ''
		}
		case 'iframe':
		case 'embed': {
			const src = mediaSrc(node)
			const video = src ? toVideoUrl(src) : null
			if (video) return `<a href="${escapeAttr(video)}">🎬 видео</a>`
			return ''
		}
		case 'video':
		case 'audio': {
			const src = mediaSrc(node)
			return src ? `<a href="${escapeAttr(src)}">🎬 видео</a>` : ''
		}
		case 'span': {
			if (/\bspoiler\b/.test(classes)) {
				const value = inner()
				return value.trim() ? `<tg-spoiler>${value}</tg-spoiler>` : ''
			}
			return inner()
		}
		case 'blockquote':
			return inner()
		case 'ul':
		case 'ol':
			return renderList(node, skip, context)
		case 'p':
			return `${inner()}\n\n`
		default:
			return inner()
	}
}

function renderList(
	node: ElementNode,
	skip: Set<HtmlNode>,
	context: RenderContext,
	depth = 0
): string {
	const items: string[] = []
	// Обычные пробелы съедает normalizeHtml, поэтому отступ держим на nbsp.
	const indent = '\u00a0\u00a0'.repeat(depth)
	let ordered = 0
	for (const child of node.children) {
		if (child.kind !== 'element') continue
		if (child.tag !== 'li') {
			const nested = renderInline([child], skip, context).trim()
			if (nested) items.push(`${indent}${nested}`)
			continue
		}
		ordered += 1
		const marker = node.tag === 'ol' ? `${ordered}.` : '•'
		let inline = ''
		let sublists = ''
		for (const item of child.children) {
			if (
				item.kind === 'element' &&
				(item.tag === 'ul' || item.tag === 'ol')
			) {
				sublists += `\n${renderList(item, skip, context, depth + 1)}`
				continue
			}
			inline += renderInline([item], skip, context)
		}
		const value = inline.replace(/\s+/g, ' ').trim()
		if (value) items.push(`${indent}${marker} ${value}`)
		if (sublists.replace(/^\n+/, '').trim()) {
			items.push(sublists.replace(/^\n+/, ''))
		}
	}
	return items.join('\n')
}

function renderBlockChildren(
	nodes: HtmlNode[],
	skip: Set<HtmlNode>,
	context: RenderContext
): string {
	let out = ''
	for (const node of nodes) {
		if (skip.has(node)) continue
		if (node.kind === 'text') {
			if (node.value.trim()) out += renderText(node, context)
			continue
		}
		if (SKIPPED_TAGS.has(node.tag)) continue

		switch (node.tag) {
			case 'p':
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6':
				out += `${renderInline(node.children, skip, context)}\n\n`
				break
			case 'br':
				out += '\n'
				break
			case 'ul':
			case 'ol':
				out += `${renderList(node, skip, context)}\n`
				break
			case 'pre':
				out += `${renderInline([node], skip, context)}\n\n`
				break
			default:
				if (CONTAINER_TAGS.has(node.tag)) {
					out += renderBlockChildren(node.children, skip, context)
					break
				}
				out += renderInline([node], skip, context)
		}
	}
	return out
}

function normalizeHtml(html: string): string {
	return html
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n[ \t]+/g, '\n')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

// ---------------------------------------------------------------- extraction

const JUNK_TAGS = [
	'script',
	'style',
	'svg',
	'button',
	'canvas',
	'form',
	'input',
	'select',
	'textarea',
	'noscript',
	'template',
]

export function stripJunkSubtrees(htmlContent: string): string {
	if (!htmlContent) return ''
	const names = JUNK_TAGS.join('|')
	const out = htmlContent.replace(
		new RegExp(`<(${names})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'),
		''
	)
	return out.replace(new RegExp(`<\\/?(${names})\\b[^>]*>`, 'gi'), '')
}

function usernameFromHref(href: string | null): string | null {
	if (!href) return null
	const match = /\/u\/([^/?#]+)/.exec(href)
	if (!match) return null
	try {
		return decodeURIComponent(match[1])
	} catch {
		return match[1]
	}
}

/**
 * Flarum рендерит упоминание как `<a class="PostMention" href="/u/<username>"
 * data-id="<postId>">Display Name</a>` — видимый текст это displayName,
 * поэтому username берём из href, а не из текста.
 */
function mentionReference(anchor: ElementNode): QuoteReference | null {
	const href = absolutize(anchor.attrs.href)
	const displayName = nodeText(anchor).trim().replace(/^@/, '') || null
	const author = usernameFromHref(href) ?? displayName
	const postId = anchor.attrs['data-id']?.trim() || null
	if (!author && !postId) return null
	return {
		postId,
		author,
		authorDisplayName: displayName,
		link: href && /\/d\//.test(href) ? href : null,
	}
}

function findReplyReference(
	nodes: HtmlNode[],
	insideQuote = false
): QuoteReference | null {
	for (const node of nodes) {
		if (node.kind !== 'element') continue
		if (node.tag === 'blockquote') continue
		if (isReplyMention(node) && !insideQuote) {
			const reference = mentionReference(node)
			if (reference?.postId) return reference
			continue
		}
		const nested = findReplyReference(node.children, insideQuote)
		if (nested) return nested
	}
	return null
}

function buildQuote(
	node: ElementNode,
	skip: Set<HtmlNode>
): ParsedQuote | null {
	const mention = findFirst(node.children, isMention)
	let author: string | null = null
	let authorDisplayName: string | null = null
	let authorUrl: string | null = null
	let link: string | null = null
	let postId: string | null = null

	if (mention) {
		const reference = mentionReference(mention)
		if (reference) {
			author = reference.author
			authorDisplayName = reference.authorDisplayName
			link = reference.link
			postId = reference.postId
			if (author) authorUrl = getUserProfileUrl(author)
		}
		skip.add(mention)
	}

	const html = normalizeHtml(
		renderBlockChildren(node.children, skip, DEFAULT_CONTEXT)
	)
	if (!html) return null

	return {
		author,
		authorDisplayName,
		authorUrl,
		authorAvatarUrl: null,
		link,
		postId,
		html,
	}
}

export function extractMessage(contentHtml: string): ParsedMessage {
	if (!contentHtml) {
		return { blocks: [], quotes: [], responseHtml: '', reply: null }
	}

	const tree = parseHtml(stripJunkSubtrees(contentHtml))
	const reply = findReplyReference(tree)
	const blocks: MessageBlock[] = []
	let buffer: string[] = []

	const flush = () => {
		const html = normalizeHtml(buffer.join(''))
		buffer = []
		if (html) blocks.push({ kind: 'text', html })
	}

	const walk = (nodes: HtmlNode[]) => {
		for (const node of nodes) {
			if (node.kind === 'text') {
				if (node.value.trim()) {
					buffer.push(renderText(node, DEFAULT_CONTEXT))
				}
				continue
			}
			if (SKIPPED_TAGS.has(node.tag)) continue

			if (node.tag === 'blockquote') {
				flush()
				const quote = buildQuote(node, new Set())
				if (quote) blocks.push({ kind: 'quote', ...quote })
				continue
			}
			if (CONTAINER_TAGS.has(node.tag)) {
				walk(node.children)
				continue
			}
			buffer.push(renderBlockChildren([node], new Set(), DEFAULT_CONTEXT))
		}
	}

	walk(tree)
	flush()

	const quotes = blocks
		.filter((block): block is { kind: 'quote' } & ParsedQuote => {
			return block.kind === 'quote'
		})
		.map(({ kind: _kind, ...quote }) => quote)

	const responseHtml = blocks
		.filter((block) => block.kind === 'text')
		.map((block) => (block as { html: string }).html)
		.join('\n\n')

	return { blocks, quotes, responseHtml, reply }
}

// ---------------------------------------------------------------- links

export function extractImageLinks(htmlContent: string): string[] {
	if (!htmlContent) return []
	const out: string[] = []
	const push = (raw: string | undefined | null) => {
		const src = absolutize(raw)
		if (!src) return
		if (!out.includes(src)) out.push(src)
	}

	const attrRe =
		/<(?:img|video|source)\b[^>]*\b(?:src|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
	let match: RegExpExecArray | null
	while ((match = attrRe.exec(htmlContent)) !== null) {
		const tagEnd = htmlContent.indexOf('>', match.index)
		const tag = htmlContent.slice(
			match.index,
			tagEnd === -1 ? undefined : tagEnd
		)
		if (/\bemoji\b/.test(tag)) continue
		push(match[2] ?? match[3] ?? match[4])
	}

	const thumbRe =
		/https?:\/\/i\.ytimg\.com\/vi\/[\w-]+\/[\w.]+\.(?:jpg|webp)/gi
	let thumb: RegExpExecArray | null
	while ((thumb = thumbRe.exec(htmlContent)) !== null) push(thumb[0])
	return out
}

export function extractVideoLinks(htmlContent: string): string[] {
	if (!htmlContent) return []
	const out: string[] = []
	const push = (raw: string | undefined | null) => {
		const url = raw ? toVideoUrl(raw) : null
		if (url && !out.includes(url)) out.push(url)
	}
	const attrRe =
		/<(?:iframe|embed|video|source|a)\b[^>]*\b(?:src|href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
	let match: RegExpExecArray | null
	while ((match = attrRe.exec(htmlContent)) !== null) {
		push(match[2] ?? match[3] ?? match[4])
	}
	return out
}

export interface EmbedFallback {
	html: string
	text: string
	videos: string[]
	images: string[]
}

export function buildEmbedFallback(contentHtml: string): EmbedFallback {
	const videos = extractVideoLinks(contentHtml)
	const images = extractImageLinks(contentHtml)
	const htmlParts: string[] = []
	const textParts: string[] = []
	for (const video of videos) {
		const safe = escapeHtml(video)
		htmlParts.push(`🎬 Видео: <a href="${safe}">${safe}</a>`)
		textParts.push(`Видео: ${video}`)
	}
	for (const image of images) {
		const safe = escapeHtml(image)
		htmlParts.push(`<a href="${safe}">фото</a>`)
		textParts.push(`фото: ${image}`)
	}
	return {
		html: htmlParts.join('\n'),
		text: textParts.join('\n'),
		videos,
		images,
	}
}

// ---------------------------------------------------------------- formatting

export interface OriginalPost {
	content: string
	author: string | null
	authorDisplayName: string | null
	avatarUrl: string | null
}

export interface FormatDeps {
	loadOriginalPost?: (postId: string) => Promise<OriginalPost | null>
	resolveUser?: (username: string) => Promise<{
		avatarUrl: string | null
		displayName?: string | null
	} | null>
}

export function cleanMessage(message: string): string {
	return message.replace(/\n+$/, '').trimEnd()
}

export interface FormatInput {
	author: string
	contentHtml: string
	messageLink: string
	discussionTitle?: string | null
	authorDisplayName?: string | null
	authorAvatarUrl?: string | null
}

export interface FormatOutput extends ParsedMessage {
	author: string
	authorDisplayName: string
	authorProfileUrl: string
	authorAvatarUrl: string | null
	authorLink: string
	messageLink: string
	telegramHtml: string
}

function quoteHeader(quote: ParsedQuote): string {
	const name = quote.authorDisplayName?.trim() || quote.author
	if (!name) return '<b>Цитата:</b>'
	return `<b>${escapeHtml(name)} написал:</b>`
}

function stripLeadingMention(html: string, author: string | null): string {
	if (!author) return html
	const escapedName = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const re = new RegExp(`^\\s*<a href="[^"]*">@${escapedName}</a>\\s*`, 'i')
	return html.replace(re, '')
}

/** Убирает «висящее» упоминание автора цитаты в конце текста. */
function stripTrailingMention(html: string, author: string | null): string {
	if (!author) return html
	const escapedName = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const re = new RegExp(
		`(?:\\s*<a href="[^"]*">@${escapedName}</a>)+\\s*$`,
		'i'
	)
	return html.replace(re, '')
}

export async function formatDevMessage(
	input: FormatInput,
	deps: FormatDeps = {}
): Promise<FormatOutput> {
	const { author, contentHtml, messageLink } = input
	const authorDisplayName = input.authorDisplayName?.trim() || author
	const authorProfileUrl = getUserProfileUrl(author)
	const authorLink = `<a href="${escapeAttr(authorProfileUrl)}">${escapeHtml(authorDisplayName)}</a>`

	const parsed = extractMessage(contentHtml)
	const blocks: MessageBlock[] = [...parsed.blocks]

	if (deps.resolveUser) {
		const resolve = deps.resolveUser
		await Promise.all(
			blocks.map(async (block) => {
				if (block.kind !== 'quote' || !block.author) return
				if (block.authorAvatarUrl) return
				const user = await resolve(block.author).catch(() => null)
				if (!user) return
				if (user.avatarUrl) block.authorAvatarUrl = user.avatarUrl
				// Ник в упоминании может быть устаревшим display name.
				if (user.displayName?.trim()) {
					block.authorDisplayName = user.displayName.trim()
				}
			})
		)
	}

	const reply = parsed.reply
	if (deps.loadOriginalPost && reply?.postId) {
		const alreadyQuoted = blocks.some(
			(block) => block.kind === 'quote' && block.postId === reply.postId
		)
		if (!alreadyQuoted) {
			const original = await deps
				.loadOriginalPost(reply.postId)
				.catch(() => null)
			if (original?.content) {
				const inner = extractMessage(original.content)
				const html =
					inner.responseHtml ||
					inner.quotes.map((quote) => quote.html).join('\n\n')
				if (html) {
					blocks.unshift({
						kind: 'quote',
						author: original.author ?? reply.author,
						authorDisplayName:
							original.authorDisplayName ??
							reply.authorDisplayName,
						authorUrl: original.author
							? getUserProfileUrl(original.author)
							: null,
						authorAvatarUrl: original.avatarUrl,
						link: reply.link,
						postId: reply.postId,
						html,
					})

					// В ответе через упоминание повторять @ник в тексте незачем.
					const mentionTarget = original.author ?? reply.author
					for (let index = 0; index < blocks.length; index++) {
						const block = blocks[index]
						if (block.kind !== 'text') continue
						const trimmed = stripTrailingMention(
							stripLeadingMention(block.html, mentionTarget),
							mentionTarget
						).trim()
						if (trimmed) block.html = trimmed
						else blocks.splice(index--, 1)
					}
				}
			}
		}
	}

	const parts: string[] = [`<b>🔔 Новый комментарий от ${authorLink}</b>`]
	const title = input.discussionTitle?.trim()
	if (title) parts.push(`<b>💬 ${escapeHtml(title)}</b>`)

	for (const block of blocks) {
		if (block.kind === 'text') {
			parts.push(block.html)
			continue
		}
		parts.push(
			`${quoteHeader(block)}\n<blockquote expandable>${block.html}</blockquote>`
		)
	}

	if (blocks.length === 0) {
		const fallback = buildEmbedFallback(contentHtml)
		if (fallback.html.trim()) {
			parts.push(
				`<b>${authorLink} прикрепил:</b>\n<blockquote expandable>${fallback.html}</blockquote>`
			)
		}
	}

	parts.push(
		`#${escapeHtml(author)}\n🔗 <a href="${escapeAttr(messageLink)}">Ссылка на сообщение</a>`
	)

	const filtered = parts.filter((part) => part && part.trim())
	const telegramHtml = cleanMessage(
		filtered.join('\n\n').replace(/\n{3,}/g, '\n\n')
	)

	const quotes = blocks
		.filter((block): block is { kind: 'quote' } & ParsedQuote => {
			return block.kind === 'quote'
		})
		.map(({ kind: _kind, ...quote }) => quote)

	const responseHtml = blocks
		.filter((block) => block.kind === 'text')
		.map((block) => (block as { html: string }).html)
		.join('\n\n')

	return {
		author,
		authorDisplayName,
		authorProfileUrl,
		authorAvatarUrl: input.authorAvatarUrl ?? null,
		authorLink,
		messageLink,
		blocks,
		quotes,
		responseHtml,
		reply,
		telegramHtml,
	}
}

function stripTags(value: string): string {
	return value
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(?:p|div|li|blockquote|pre)>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
}

export function toPlainFallback(telegramHtml: string): string {
	return stripTags(telegramHtml)
}
