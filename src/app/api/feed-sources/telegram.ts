import { createHash } from 'node:crypto'
import { parseFeedIcon } from '@/app/api/feed-sources/icon'
import { buildFeedSourceUrl } from '@/app/api/feed-sources/url'
import { postsService } from '@/app/api/posts/posts.service'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { putUpload } from '@/lib/uploads'
import { validateImageUpload } from '@/utils/upload-validation'

type TelegramAuthor = { name?: string }

export type TelegramFeedItem = {
	title?: string
	content_html?: string
	url?: string
	date_published?: string
	authors?: TelegramAuthor[]
}

export type TelegramFeed = {
	items?: TelegramFeedItem[]
}

type ParsedTelegramItem = TelegramFeedItem & { publishedDate: Date }

export function buildTelegramFeedUrl(
	baseUrl: string,
	externalId: string
): string {
	return `${baseUrl.replace(/\/$/, '')}/telegram/channel/${encodeURIComponent(externalId)}?format=json`
}

export function htmlToText(html: string): string {
	return html
		.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, '')
		.replace(/<img\b[^>]*>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p\s*>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&nbsp;/gi, ' ')
		.replace(/\r\n?/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

export function extractTelegramImageUrls(html: string): string[] {
	const urls: string[] = []
	const seen = new Set<string>()
	const imagePattern = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi
	for (const match of html.matchAll(imagePattern)) {
		const value = match[2]
		try {
			const url = new URL(value)
			if (
				(url.protocol === 'http:' || url.protocol === 'https:') &&
				!seen.has(url.href)
			) {
				seen.add(url.href)
				urls.push(url.href)
				if (urls.length === 4) break
			}
		} catch {
			continue
		}
	}
	return urls
}

const CUSTOM_EMOJI_TAG =
	/<tg-emoji\b[^>]*\bemoji-id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi

const CUSTOM_EMOJI_BLOCK =
	/<tg-emoji\b[^>]*\bemoji-id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/tg-emoji>/gi

export function extractTelegramCustomEmojiIds(html: string): string[] {
	const ids: string[] = []
	const seen = new Set<string>()
	for (const match of html.matchAll(CUSTOM_EMOJI_TAG)) {
		const id = (match[1] ?? match[2] ?? match[3] ?? '').trim()
		if (!/^\d+$/.test(id) || seen.has(id)) continue
		seen.add(id)
		ids.push(id)
	}
	return ids
}

function escapeMarkdownAlt(value: string): string {
	return value.replace(/([\\[\]])/g, '\\$1')
}

export function replaceTelegramCustomEmoji(
	html: string,
	urls: Map<string, string>
): string {
	if (urls.size === 0) return html
	return html.replace(
		CUSTOM_EMOJI_BLOCK,
		(_full, doubleQuoted, singleQuoted, unquoted, inner: string) => {
			const id = (doubleQuoted ?? singleQuoted ?? unquoted ?? '').trim()
			const fallback = htmlToText(inner).replace(/\s+/g, ' ').trim()
			const url = urls.get(id)
			if (!url) return fallback
			const alt = escapeMarkdownAlt(fallback)
			return `![${alt}](${url})`
		}
	)
}

type TelegramApiResponse<T> = {
	ok: boolean
	result?: T
	description?: string
}

type TelegramSticker = {
	file_id?: string
	is_animated?: boolean
	is_video?: boolean
	custom_emoji_id?: string
	thumbnail?: { file_id?: string }
	thumb?: { file_id?: string }
}

type TelegramFile = { file_path?: string }

const CUSTOM_EMOJI_URLS = new Map<string, string>()
const CUSTOM_EMOJI_BATCH_SIZE = 200

async function telegramBotApi<T>(
	token: string,
	method: string,
	payload: Record<string, unknown>
): Promise<T | null> {
	try {
		const response = await fetch(
			`https://api.telegram.org/bot${token}/${method}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(15_000),
			}
		)
		const data = (await response.json()) as TelegramApiResponse<T>
		return data.ok && data.result ? data.result : null
	} catch {
		return null
	}
}

async function downloadTelegramCustomEmoji(
	token: string,
	id: string,
	sticker: TelegramSticker
): Promise<string | null> {
	const fileId =
		sticker.is_animated || sticker.is_video
			? (sticker.thumbnail?.file_id ?? sticker.thumb?.file_id)
			: sticker.file_id
	if (!fileId) return null
	const file = await telegramBotApi<TelegramFile>(token, 'getFile', {
		file_id: fileId,
	})
	const filePath = file?.file_path
	if (!filePath || filePath.includes('..')) return null
	try {
		const response = await fetch(
			`https://api.telegram.org/file/bot${token}/${filePath}`,
			{ signal: AbortSignal.timeout(15_000) }
		)
		if (!response.ok) return null
		const buffer = Buffer.from(await response.arrayBuffer())
		const { mime, ext } = validateImageUpload(buffer)
		const publicPath = `/uploads/feed/emojis/${id}${ext}`
		try {
			await putUpload(publicPath, buffer, mime)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return null
		}
		return publicPath
	} catch {
		return null
	}
}

export async function resolveTelegramCustomEmojiUrls(
	ids: string[]
): Promise<Map<string, string>> {
	const urls = new Map<string, string>()
	const token = env.TG_BOT_TOKEN?.trim()
	const unique = [...new Set(ids.filter((id) => /^\d+$/.test(id.trim())))]
	if (!token || unique.length === 0) return urls
	for (
		let offset = 0;
		offset < unique.length;
		offset += CUSTOM_EMOJI_BATCH_SIZE
	) {
		const batch = unique.slice(offset, offset + CUSTOM_EMOJI_BATCH_SIZE)
		const stickers = await telegramBotApi<TelegramSticker[]>(
			token,
			'getCustomEmojiStickers',
			{ custom_emoji_ids: batch }
		)
		if (!stickers) continue
		const batchSet = new Set(batch)
		for (const sticker of stickers) {
			const id = sticker.custom_emoji_id?.trim()
			if (!id || !batchSet.has(id) || urls.has(id)) continue
			const cached = CUSTOM_EMOJI_URLS.get(id)
			if (cached) {
				urls.set(id, cached)
				continue
			}
			const publicPath = await downloadTelegramCustomEmoji(
				token,
				id,
				sticker
			)
			if (!publicPath) continue
			CUSTOM_EMOJI_URLS.set(id, publicPath)
			urls.set(id, publicPath)
		}
	}
	return urls
}

export function parseTelegramFeed(value: unknown): ParsedTelegramItem[] {
	if (!value || typeof value !== 'object')
		throw new Error('RSS response was not a JSON object')
	const items = (value as TelegramFeed).items
	if (!Array.isArray(items))
		throw new Error('RSS response did not contain items')
	return items
		.map((item) => ({
			...item,
			publishedDate: item.date_published
				? new Date(item.date_published)
				: new Date(Number.NaN),
		}))
		.filter(
			(item): item is ParsedTelegramItem =>
				item.publishedDate instanceof Date &&
				!Number.isNaN(item.publishedDate.getTime())
		)
		.sort((a, b) => a.publishedDate.getTime() - b.publishedDate.getTime())
}

function extractMessageId(url: string | undefined): string | null {
	if (!url) return null
	try {
		const parsed = new URL(url)
		const parts = parsed.pathname.split('/').filter(Boolean)
		if (parts[0] === 's' && /^\d+$/.test(parts[1] ?? '')) return parts[1]
		const id = parts[parts.length - 1]
		return id && /^\d+$/.test(id) ? id : null
	} catch {
		return null
	}
}

function externalKey(channel: string, item: TelegramFeedItem): string {
	const messageId = extractMessageId(item.url)
	if (messageId) return `tg:${channel}:${messageId}`
	const digest = createHash('sha1')
		.update(`${item.url ?? ''}\n${item.title ?? ''}`)
		.digest('hex')
		.slice(0, 16)
	return `tg:${channel}:u${digest}`
}

export function telegramItemContent(
	item: TelegramFeedItem,
	emojiUrls?: Map<string, string>
): string {
	const html = item.content_html ?? ''
	const text = htmlToText(
		emojiUrls?.size ? replaceTelegramCustomEmoji(html, emojiUrls) : html
	)
	const title = item.title?.trim() ?? ''
	if (!title) return text
	const plain = htmlToText(html)
	if (!plain || plain.split('\n', 1)[0]?.trim() !== title)
		return [title, text].filter(Boolean).join('\n\n')
	return text
}

async function fetchTelegramFeed(url: string): Promise<unknown> {
	let lastError: unknown
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(15_000),
			})
			if (!response.ok)
				throw new Error(
					`RSS request failed with HTTP ${response.status}`
				)
			return JSON.parse(await response.text())
		} catch (error) {
			lastError = error
			if (attempt === 0)
				await new Promise((resolve) => setTimeout(resolve, 1500))
		}
	}
	throw lastError instanceof Error ? lastError : new Error('Unknown error')
}

export async function syncTelegramSources(
	sourceIds?: number[]
): Promise<{ synced: number; errors: string[] }> {
	const sources = await prisma.feedSource.findMany({
		where: {
			type: 'TG',
			enabled: true,
			...(sourceIds ? { id: { in: sourceIds } } : {}),
		},
		orderBy: { id: 'asc' },
	})
	let synced = 0
	const errors: string[] = []
	const baseUrl = env.RSSHUB_BASE_URL.replace(/\/$/, '')

	for (const source of sources) {
		try {
			const payload = await fetchTelegramFeed(
				buildTelegramFeedUrl(baseUrl, source.external_id)
			)
			const feed = parseTelegramFeed(payload)
			const avatarUrl = parseFeedIcon(payload)
			const newestPublished = feed.length
				? feed[feed.length - 1].publishedDate
				: new Date()
			if (source.last_synced_at) {
				for (const item of feed) {
					if (item.publishedDate <= source.last_synced_at) continue
					const html = item.content_html ?? ''
					const emojiUrls = await resolveTelegramCustomEmojiUrls(
						extractTelegramCustomEmojiIds(html)
					).catch(() => new Map<string, string>())
					const content = telegramItemContent(item, emojiUrls)
					if (!content) continue
					const result = await postsService.createIngest({
						source: 'TG',
						external_key: externalKey(source.external_id, item),
						content,
						image_urls: extractTelegramImageUrls(html),
						author_name:
							item.authors?.[0]?.name ??
							source.label ??
							source.external_id,
						source_url: buildFeedSourceUrl(
							'TG',
							source.external_id,
							item.url
						),
						source_avatar_url: avatarUrl,
						feed_source_id: source.id,
					})
					if (result.created) synced += 1
				}
			}
			await prisma.post.updateMany({
				where: {
					source: 'TG',
					external_key: {
						startsWith: `tg:${source.external_id}:`,
					},
				},
				data: {
					feed_source_id: source.id,
					...(avatarUrl ? { source_avatar_url: avatarUrl } : {}),
				},
			})
			await prisma.feedSource.update({
				where: { id: source.id },
				data: { last_synced_at: newestPublished },
			})
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown error'
			errors.push(`tg:${source.external_id}: ${message}`)
		}
	}

	return { synced, errors }
}
