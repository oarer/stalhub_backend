import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { blobFromBuffer } from '@/utils/image-compress'
import { type CoverImage, resolveBlogCoverImage } from './blog-cover-image'

export type BlogPublishTarget = 'tg' | 'ds'

export interface BlogPublishResult {
	url: string
	withCover: boolean
	cover_error?: string
	tg?: { ok: boolean; message_id?: number; error?: string }
	ds?: { ok: boolean; message_id?: string; error?: string }
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
}

function blogPostUrl(article: { id: number; external_id: string }): string {
	const base = (env.BLOG_PUBLIC_BASE_URL || env.WEB_ORIGIN).replace(/\/$/, '')
	return `${base}/blog/${article.external_id || article.id}`
}

const EMOJI_STAR = '5841235769728962577'
const EMOJI_HAMMER = '5940433880585605708'
const EMOJI_LINK = '5902449142575141204'

const SUPPORT_URL = 'https://pay.cloudtips.ru/p/4500e11c'
const DEV_URL = 'https://t.me/oarer_yml'
const DEV_LABEL = 'oarer_yml.t.me'
const CHANNEL_URL = 'http://st4lhub.t.me/'
const ISSUES_URL = 'http://github.com/oarer/stalhub'
const SITE_URL = 'https://stalhub.dev/'

function emojiImg(id: string, fallback: string): string {
	return `![${fallback}](tg://emoji?id=${id})`
}

function escapeRichMarkdown(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replace(/([\\*_\[\]()#+\-.!|{}~=`$])/g, '\\$1')
}

function buildRichMarkdown(input: {
	title: string
	digest: string
	url: string
	withCover: boolean
}): string {
	const title = escapeRichMarkdown(input.title)
	const digest = escapeRichMarkdown(input.digest)
	const lines: string[] = []
	if (input.withCover) lines.push('![](tg://photo?id=cover)', '')
	lines.push(
		`# ${title}`,
		'',
		digest,
		'',
		`[🔗 Читать полностью](${input.url})`,
		'',
		'',
		'---',
		'',
		'',
		`${emojiImg(EMOJI_STAR, '⭐️')} **Поддержать проект**`,
		'',
		`- [Cloudtips](${SUPPORT_URL})`,
		'',
		'',
		`${emojiImg(EMOJI_HAMMER, '🔨')} **Сообщить о проблеме можно здесь**`,
		'',
		`- [${DEV_LABEL}](${DEV_URL}) (главный разработчик)`,
		`- [st4lhub.t.me](${CHANNEL_URL}) (директ канала)`,
		`- [github.com/oarer/stalhub](${ISSUES_URL}) (GitHub Issues)`,
		'',
		'',
		`${emojiImg(EMOJI_LINK, '🔗')} **Ссылки на сайт**`,
		'',
		`- [stalhub.dev](${SITE_URL})`
	)
	return lines.join('\n')
}

function buildTgFooter(): string {
	return [
		'⭐ Поддержать проект',
		`- <a href="${SUPPORT_URL}">Cloudtips</a>`,
		'',
		'🔨 Сообщить о проблеме можно здесь',
		`- <a href="${DEV_URL}">oarer_</a> (главный разработчик)`,
		`- <a href="${CHANNEL_URL}">st4lhub.t.me</a> (директ канала)`,
		`- <a href="${ISSUES_URL}">github.com/oarer/stalhub</a> (GitHub Issues)`,
		'',
		'🔗 Ссылки на сайт',
		`- <a href="${SITE_URL}">stalhub.dev</a>`,
	].join('\n')
}

function buildDsFooter(): string {
	return [
		'⭐ Поддержать проект',
		`- [Cloudtips](${SUPPORT_URL})`,
		'',
		'🔨 Сообщить о проблеме можно здесь',
		`- [${DEV_LABEL}](${DEV_URL}) (главный разработчик)`,
		`- [st4lhub.t.me](${CHANNEL_URL}) (директ канала)`,
		`- [github.com/oarer/stalhub](${ISSUES_URL}) (GitHub Issues)`,
		'',
		'🔗 Ссылки на сайт',
		`- [stalhub.dev](${SITE_URL})`,
	].join('\n')
}

/** Caption с учётом лимита (1024 у фото, 4096 у текстового сообщения). */
function fitTgCaption(
	title: string,
	digest: string,
	url: string,
	limit: number
): string {
	const head = `<b>${escapeHtml(title)}</b>\n`
	const tail = `\n\n🔗 <a href="${url}">Читать полностью</a>\n\n${buildTgFooter()}`
	const room = limit - head.length - tail.length
	let body = ''
	if (room > 0) {
		body = escapeHtml(digest.slice(0, room).trim())
		if (digest.length > room) body += '…'
	}
	return `${head}${body}${tail}`.slice(0, limit)
}

interface TgFile {
	field: string
	blob: Blob
	filename: string
}

interface TgApiResult {
	ok: boolean
	result?: { message_id: number }
	description?: string
	error_code?: number
}

async function tgApiCall(
	token: string,
	method: string,
	params: Record<string, unknown>,
	file?: TgFile,
	timeoutMs = 30_000,
	tries = 3
): Promise<TgApiResult> {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
	const doPost = async (withButton: boolean): Promise<TgApiResult> => {
		const p: Record<string, unknown> = { ...params }
		if (!withButton) delete p.reply_markup
		const res = file
			? await fetch(`https://api.telegram.org/bot${token}/${method}`, {
					method: 'POST',
					body: (() => {
						const form = new FormData()
						for (const [k, v] of Object.entries(p)) {
							form.append(
								k,
								typeof v === 'string' ? v : JSON.stringify(v)
							)
						}
						form.append(file.field, file.blob, file.filename)
						return form
					})(),
					signal: AbortSignal.timeout(timeoutMs),
				})
			: await fetch(`https://api.telegram.org/bot${token}/${method}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(p),
					signal: AbortSignal.timeout(timeoutMs),
				})
		return (await res.json()) as TgApiResult
	}

	let lastError = 'request failed'
	for (let attempt = 1; attempt <= tries; attempt++) {
		try {
			let data = await doPost(true)
			if (
				!data.ok &&
				data.description?.includes('inline keyboard button')
			) {
				console.warn(
					`[BlogPublish] button URL rejected, retry without keyboard: ${data.description}`
				)
				data = await doPost(false)
			}
			const retryableApi =
				!data.ok &&
				(data.error_code === 429 || (data.error_code ?? 0) >= 500)
			if (!retryableApi) return data
			lastError = data.description ?? `api ${data.error_code}`
		} catch (err) {
			lastError = (err as Error).message
		}
		if (attempt < tries) {
			console.warn(
				`[BlogPublish] ${method} attempt ${attempt}/${tries} failed (${lastError}), retrying…`
			)
			await sleep(1500 * attempt)
		}
	}
	return { ok: false, description: lastError }
}

async function sendRichToTelegram(
	token: string,
	chatId: string,
	input: {
		title: string
		digest: string
		url: string
		cover: CoverImage | null
	},
	replyMarkup: { inline_keyboard: { text: string; url: string }[][] }
): Promise<{ ok: boolean; message_id?: number; error?: string }> {
	const markdown = buildRichMarkdown({
		title: input.title,
		digest: input.digest,
		url: input.url,
		withCover: !!input.cover,
	})
	const richMessage: Record<string, unknown> = { markdown }
	if (input.cover) {
		richMessage.media = [
			{
				id: 'cover',
				media: { type: 'photo', media: 'attach://cover' },
			},
		]
	}

	const data = await tgApiCall(
		token,
		'sendRichMessage',
		{
			chat_id: chatId,
			rich_message: richMessage,
			reply_markup: replyMarkup,
		},
		input.cover
			? {
					field: 'cover',
					blob: blobFromBuffer(input.cover.buffer, input.cover.mime),
					filename: input.cover.filename,
				}
			: undefined,
		60_000
	)
	if (!data.ok)
		return {
			ok: false,
			error: `rich ${data.error_code ?? ''}: ${data.description ?? 'sendRichMessage failed'}`.trim(),
		}
	return { ok: true, message_id: data.result?.message_id }
}

async function sendLegacyToTelegram(
	token: string,
	chatId: string,
	input: {
		title: string
		digest: string
		url: string
		cover: CoverImage | null
	},
	replyMarkup: { inline_keyboard: { text: string; url: string }[][] }
): Promise<{ ok: boolean; message_id?: number; error?: string }> {
	const caption = input.cover
		? fitTgCaption(input.title, input.digest, input.url, 1024)
		: fitTgCaption(input.title, input.digest, input.url, 4096)

	if (input.cover) {
		const data = await tgApiCall(
			token,
			'sendPhoto',
			{
				chat_id: chatId,
				caption,
				parse_mode: 'HTML',
				reply_markup: replyMarkup,
			},
			{
				field: 'photo',
				blob: blobFromBuffer(input.cover.buffer, input.cover.mime),
				filename: input.cover.filename,
			},
			30_000
		)
		if (!data.ok)
			return { ok: false, error: data.description ?? 'sendPhoto failed' }
		return { ok: true, message_id: data.result?.message_id }
	}

	const data = await tgApiCall(
		token,
		'sendMessage',
		{
			chat_id: chatId,
			text: caption.slice(0, 4096),
			parse_mode: 'HTML',
			reply_markup: replyMarkup,
		},
		undefined,
		30_000
	)
	if (!data.ok)
		return { ok: false, error: data.description ?? 'sendMessage failed' }
	return { ok: true, message_id: data.result?.message_id }
}

async function sendToTelegram(input: {
	title: string
	digest: string
	url: string
	cover: CoverImage | null
}): Promise<{ ok: boolean; message_id?: number; error?: string }> {
	const token = env.TG_BOT_TOKEN
	const chatId = env.TG_CHAT_ID
	if (!token || !chatId)
		return { ok: false, error: 'Telegram not configured' }

	const replyMarkup = {
		inline_keyboard: [[{ text: 'Читать на StalHub', url: input.url }]],
	}

	const rich = await sendRichToTelegram(token, chatId, input, replyMarkup)
	if (rich.ok) return rich

	console.warn(`[BlogPublish] rich failed, legacy fallback: ${rich.error}`)
	const legacy = await sendLegacyToTelegram(token, chatId, input, replyMarkup)
	if (!legacy.ok)
		return {
			ok: false,
			error: `rich: ${rich.error} | legacy: ${legacy.error}`,
		}
	return legacy
}

async function sendToDiscord(input: {
	title: string
	digest: string
	url: string
	cover: CoverImage | null
}): Promise<{ ok: boolean; message_id?: string; error?: string }> {
	const webhook = env.BLOG_DISCORD_WEBHOOK_URL
	if (!webhook) return { ok: false, error: 'Discord webhook not configured' }

	const embed = {
		title: input.title.slice(0, 256),
		url: input.url,
		description:
			`${input.digest}\n\n[🔗 Читать полностью](${input.url})\n\n${buildDsFooter()}`.slice(
				0,
				4096
			),
		color: 0x4da3ff,
		...(input.cover ? { image: { url: 'attachment://cover.png' } } : {}),
		footer: { text: 'StalHub · блог' },
		timestamp: new Date().toISOString(),
	}

	const payload = {
		content: '@everyone',
		embeds: [embed],
		allowed_mentions: { parse: ['everyone'] },
	}

	try {
		let res: Response
		if (input.cover) {
			const form = new FormData()
			form.append('payload_json', JSON.stringify(payload))
			form.append(
				'files[0]',
				blobFromBuffer(input.cover.buffer, input.cover.mime),
				'cover.png'
			)
			res = await fetch(`${webhook}?wait=true`, {
				method: 'POST',
				body: form,
				signal: AbortSignal.timeout(30_000),
			})
		} else {
			res = await fetch(`${webhook}?wait=true`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(30_000),
			})
		}
		if (!res.ok) {
			const text = await res.text().catch(() => '')
			return {
				ok: false,
				error: `webhook ${res.status}: ${text.slice(0, 200)}`,
			}
		}
		const data = (await res.json().catch(() => null)) as {
			id?: string
		} | null
		return { ok: true, message_id: data?.id }
	} catch (err) {
		return { ok: false, error: (err as Error).message }
	}
}

export async function publishBlogPost(
	articleId: string | number,
	opts: { digest: string; targets: BlogPublishTarget[]; withCover: boolean }
): Promise<BlogPublishResult> {
	const num = Number(articleId)
	const resolved = await prisma.article.findFirst({
		where: isNaN(num)
			? { external_id: String(articleId) }
			: { OR: [{ external_id: String(articleId) }, { id: num }] },
		select: { id: true, external_id: true, title: true, image_url: true },
	})
	if (!resolved) throw new Error('Article not found')
	const article = resolved

	const url = blogPostUrl(article)
	const { cover, coverError } = opts.withCover
		? await resolveBlogCoverImage(article)
		: { cover: null, coverError: undefined }
	const input = { title: article.title, digest: opts.digest, url, cover }

	const result: BlogPublishResult = {
		url,
		withCover: !!cover,
		...(coverError ? { cover_error: coverError.slice(0, 500) } : {}),
	}
	if (opts.targets.includes('tg')) result.tg = await sendToTelegram(input)
	if (opts.targets.includes('ds')) result.ds = await sendToDiscord(input)

	console.log(
		`[BlogPublish] article ${article.id} -> tg=${result.tg?.ok ?? 'skip'} ds=${result.ds?.ok ?? 'skip'} cover=${result.withCover}`
	)
	return result
}
