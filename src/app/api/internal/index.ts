import { randomUUID } from 'node:crypto'
import { t } from 'elysia'
import type { PostSource } from 'generated/prisma/client'
import { postsService } from '@/app/api/posts/posts.service'
import { env } from '@/env'
import { putUpload } from '@/lib/uploads'
import { createElysia } from '@/utils/elysia'
import {
	IMAGE_UPLOAD_MAX_BYTES,
	validateImageUpload,
} from '@/utils/upload-validation'

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value)
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}

function isAcceptedImageUrl(value: string): boolean {
	if (value.startsWith('/uploads/')) return !value.includes('..')
	return isHttpUrl(value)
}

const feedPostBody = t.Object({
	source: t.Union([
		t.Literal('TG'),
		t.Literal('YOUTUBE'),
		t.Literal('EFORUM'),
	]),
	external_key: t.String({ minLength: 1, maxLength: 500 }),
	content: t.String({ minLength: 1, maxLength: 50000 }),
	image_urls: t.Optional(
		t.Array(t.String({ maxLength: 2000 }), { maxItems: 10 })
	),
	author_name: t.Optional(t.String({ maxLength: 200 })),
	source_url: t.Optional(t.String({ maxLength: 2000 })),
	source_avatar_url: t.Optional(t.String({ maxLength: 2000 })),
})

export const internalRoutes = createElysia().group('/internal', (app) =>
	app
		.post(
			'/bot/notify',
			{
				body: t.Object({ channel_id: t.String(), message: t.String() }),
				detail: { tags: ['Internal'] },
			},
			async ({ body, headers, set }) => {
				const auth =
					(headers as Record<string, string | undefined>)[
						'x-bot-secret'
					] ?? ''
				if (
					!env.DISCORD_BOT_SERVICE_JWT ||
					auth !== env.DISCORD_BOT_SERVICE_JWT
				) {
					set.status = 401
					return { error: 'Invalid bot secret' }
				}
				return { ok: true, payload: body }
			}
		)
		.post(
			'/feed-posts',
			{
				body: feedPostBody,
				detail: { tags: ['Internal'] },
			},
			async ({ body, headers, set }) => {
				const auth =
					(headers as Record<string, string | undefined>)[
						'x-bot-secret'
					] ?? ''
				if (
					!env.DISCORD_BOT_SERVICE_JWT ||
					auth !== env.DISCORD_BOT_SERVICE_JWT
				) {
					set.status = 401
					return { error: 'Invalid bot secret' }
				}
				if (body.image_urls?.some((url) => !isAcceptedImageUrl(url))) {
					set.status = 400
					return { error: 'Invalid image URL' }
				}
				if (body.source_url && !isHttpUrl(body.source_url)) {
					set.status = 400
					return { error: 'Invalid source URL' }
				}
				if (
					body.source_avatar_url &&
					!isHttpUrl(body.source_avatar_url)
				) {
					set.status = 400
					return { error: 'Invalid source avatar URL' }
				}
				return postsService.createIngest({
					source: body.source as PostSource,
					external_key: body.external_key,
					content: body.content,
					image_urls: body.image_urls,
					author_name: body.author_name,
					source_url: body.source_url,
					source_avatar_url: body.source_avatar_url,
				})
			}
		)
		.post(
			'/feed-posts/media',
			{
				body: t.Object({ file: t.File({ maxSize: '10m' }) }),
				detail: { tags: ['Internal'] },
			},
			async ({ body, headers, set }) => {
				const auth =
					(headers as Record<string, string | undefined>)[
						'x-bot-secret'
					] ?? ''
				if (
					!env.DISCORD_BOT_SERVICE_JWT ||
					auth !== env.DISCORD_BOT_SERVICE_JWT
				) {
					set.status = 401
					return { error: 'Invalid bot secret' }
				}
				const buffer = Buffer.from(await body.file.arrayBuffer())
				if (buffer.length > IMAGE_UPLOAD_MAX_BYTES) {
					set.status = 413
					return { error: 'Image exceeds the 10 MB limit' }
				}
				try {
					const { mime, ext } = validateImageUpload(buffer)
					const image_url = `/uploads/feed/${randomUUID()}${ext}`
					await putUpload(image_url, buffer, mime)
					return { image_url }
				} catch (error) {
					set.status = 400
					return { error: (error as Error).message }
				}
			}
		)
)
