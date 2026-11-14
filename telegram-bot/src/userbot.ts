import input from 'input'
import { TelegramClient } from 'telegram'
import { NewMessage } from 'telegram/events'
import { StringSession } from 'telegram/sessions'
import type { UserbotConfig } from './userbot-config'
import {
	loadUserbotConfig,
	sourceChannels,
	type UserbotSource,
} from './userbot-config'
import { sourceMapping, telegramEntitiesToMarkdown } from './userbot-content'

type MessageLike = {
	id: number
	message?: string
	entities?: readonly {
		offset: number
		length: number
		url?: string
		className?: string
	}[]
	media?: {
		className?: string
		document?: { mimeType?: string }
	}
	photo?: unknown
	video?: unknown
	peerId?: { channelId?: unknown }
	downloadMedia?: (options?: Record<string, unknown>) => Promise<unknown>
}

type ChatLike = {
	id?: unknown
	username?: string
	title?: string
	megagroup?: boolean
}

type NewMessageEventLike = {
	message?: MessageLike
	chatId?: unknown
	getChat?: () => Promise<ChatLike | undefined>
}

type FeedPost = {
	source: UserbotSource['source']
	external_key: string
	content: string
	image_urls: string[]
	author_name: string
}

const VIDEO_THUMBNAIL_NOTE = '[Видео: прикреплена миниатюра]'

function isVideo(message: MessageLike): boolean {
	if (message.video) return true
	return message.media?.document?.mimeType?.startsWith('video/') ?? false
}

function isPhoto(message: MessageLike): boolean {
	return (
		Boolean(message.photo) ||
		message.media?.className === 'MessageMediaPhoto'
	)
}

function mediaMimeType(message: MessageLike, video: boolean): string {
	if (video) return 'image/jpeg'
	if (message.media?.document?.mimeType?.startsWith('image/')) {
		return message.media.document.mimeType
	}
	return isPhoto(message) ? 'image/jpeg' : 'application/octet-stream'
}

function extensionForMime(mimeType: string): string {
	return (
		(
			{
				'image/jpeg': 'jpg',
				'image/png': 'png',
				'image/webp': 'webp',
				'image/gif': 'gif',
			} as Record<string, string>
		)[mimeType] ?? 'bin'
	)
}

function bytesFromDownload(value: unknown): Uint8Array | null {
	if (value instanceof Uint8Array) return value
	if (value instanceof ArrayBuffer) return new Uint8Array(value)
	if (typeof value === 'string') return null
	return null
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(`Request timed out after ${timeoutMs}ms`)
						),
					timeoutMs
				)
			}),
		])
	} finally {
		if (timer) clearTimeout(timer)
	}
}

async function fetchWithRetry<T>(
	operation: () => Promise<T>,
	maxAttempts: number,
	label: string
): Promise<T> {
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			return await operation()
		} catch (error) {
			if (attempt === maxAttempts) throw error
			const delay = 250 * 2 ** (attempt - 1)
			console.warn(
				`${label} failed (attempt ${attempt}), retrying in ${delay}ms`
			)
			await Bun.sleep(delay)
		}
	}
	throw new Error(`${label} failed`)
}

async function uploadMedia(
	config: UserbotConfig,
	bytes: Uint8Array,
	mimeType: string,
	filename: string
): Promise<string | null> {
	if (!config.mediaUploadUrl) {
		console.warn(
			'Media was downloaded but TG_MEDIA_UPLOAD_URL is not configured; posting without image_urls'
		)
		return null
	}

	return fetchWithRetry(
		async () => {
			const form = new FormData()
			const buffer = bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength
			) as ArrayBuffer
			form.set('file', new File([buffer], filename, { type: mimeType }))
			const response = await withTimeout(
				fetch(config.mediaUploadUrl!, {
					method: 'POST',
					headers: { 'x-bot-secret': config.botSecret },
					body: form,
				}),
				config.requestTimeoutMs
			)
			if (!response.ok) {
				throw new Error(
					`Media upload returned ${response.status}: ${(await response.text()).slice(0, 300)}`
				)
			}
			const payload = (await response.json()) as {
				image_url?: unknown
				url?: unknown
			}
			const url = payload.image_url ?? payload.url
			if (typeof url !== 'string' || !url) {
				throw new Error(
					'Media upload response did not contain image_url or url'
				)
			}
			return url
		},
		config.maxAttempts,
		'Media upload'
	)
}

export async function postFeedPost(
	config: Pick<
		UserbotConfig,
		'backendUrl' | 'botSecret' | 'requestTimeoutMs' | 'maxAttempts'
	>,
	post: FeedPost
): Promise<void> {
	await fetchWithRetry(
		async () => {
			const response = await withTimeout(
				fetch(`${config.backendUrl}/internal/feed-posts`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'x-bot-secret': config.botSecret,
					},
					body: JSON.stringify(post),
				}),
				config.requestTimeoutMs
			)
			if (response.status === 409) return
			if (!response.ok) {
				throw new Error(
					`Feed post returned ${response.status}: ${(await response.text()).slice(0, 300)}`
				)
			}
		},
		config.maxAttempts,
		'Feed post'
	)
}

async function downloadMessageMedia(
	config: UserbotConfig,
	message: MessageLike
): Promise<string[]> {
	const video = isVideo(message)
	if (!video && !isPhoto(message)) return []
	if (!message.downloadMedia) return []

	const downloaded = await withTimeout(
		message.downloadMedia(
			video ? { thumb: 0, workers: 1 } : { workers: 1 }
		),
		config.requestTimeoutMs
	)
	const bytes = bytesFromDownload(downloaded)
	if (!bytes) {
		console.warn('Telegram media download did not return bytes')
		return []
	}
	const mimeType = mediaMimeType(message, video)
	const filename = `telegram-${message.id}.${extensionForMime(mimeType)}`
	const uploaded = await uploadMedia(config, bytes, mimeType, filename)
	return uploaded ? [uploaded] : []
}

async function handleMessage(
	config: UserbotConfig,
	event: NewMessageEventLike
): Promise<void> {
	const message = event.message
	if (!message) return
	const chat = await event.getChat?.()
	const mapping = sourceMapping(
		[chat?.username, chat?.id, event.chatId, message.peerId?.channelId],
		config.sources
	)
	if (!mapping) return

	const sourceChannel = mapping.channel
	const text = telegramEntitiesToMarkdown(
		message.message ?? '',
		message.entities
	)
	const video = isVideo(message)
	const content = [video ? VIDEO_THUMBNAIL_NOTE : '', text]
		.filter(Boolean)
		.join('\n\n')
	let imageUrls: string[] = []
	try {
		imageUrls = await downloadMessageMedia(config, message)
	} catch (error) {
		console.error(
			`Failed to download/upload media for ${sourceChannel}:${message.id}:`,
			error instanceof Error ? error.message : error
		)
	}
	const authorName =
		chat?.title ?? (chat?.username ? `@${chat.username}` : sourceChannel)

	await postFeedPost(config, {
		source: mapping.source,
		external_key: `tg:${sourceChannel}:${message.id}`,
		content,
		image_urls: imageUrls,
		author_name: authorName,
	})
	console.log(`Forwarded ${mapping.source} ${sourceChannel}:${message.id}`)
}

export async function startUserbot(config: UserbotConfig): Promise<void> {
	const client = new TelegramClient(
		new StringSession(config.sessionString),
		config.apiId,
		config.apiHash,
		{ connectionRetries: 5 }
	)
	if (!config.sessionString && !process.stdin.isTTY) {
		throw new Error(
			'No Telegram session and no TTY. Run `bun run src/userbot-login.ts` interactively, then set TG_USERBOT_SESSION_STRING to the printed value.'
		)
	}

	await client.start({
		phoneNumber: async () =>
			config.phoneNumber ?? (await input.text('Telegram phone number: ')),
		phoneCode: async () => input.text('Telegram login code: '),
		password: async () => input.text('Telegram 2FA password: '),
		onError: (error: Error) =>
			console.error('Telegram login failed:', error),
	})

	const sessionString = client.session.save()
	if (!config.sessionString) {
		console.log('TG_USERBOT_SESSION_STRING=', sessionString)
		console.log(
			'Save this value in the userbot environment for headless runs.'
		)
	}

	const chats = sourceChannels(config.sources)
	client.addEventHandler(
		(event: unknown) =>
			handleMessage(config, event as NewMessageEventLike).catch(
				(error: unknown) =>
					console.error(
						'Failed to process Telegram message:',
						error instanceof Error ? error.message : error
					)
			),
		new NewMessage({ chats })
	)
	console.log(`Telegram userbot started; watching ${chats.join(', ')}`)
	await new Promise<void>(() => undefined)
}

if (import.meta.main) {
	startUserbot(loadUserbotConfig()).catch((error) => {
		console.error(
			'Telegram userbot startup failed:',
			error instanceof Error ? error.message : error
		)
		process.exit(1)
	})
}
