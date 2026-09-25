import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
	compressImageBuffer,
	detectImageMime,
	IMAGE_MIME_EXTENSIONS,
} from '@/utils/image-compress'

export const ARTICLE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const ARTICLE_IMAGE_MAX_COUNT = 50
export const ARTICLE_IMAGE_TOTAL_MAX_BYTES = 100 * 1024 * 1024
const MIME_EXTENSIONS = IMAGE_MIME_EXTENSIONS

export type QuestMap = {
	map_id: string
	map_name?: string
	markers: Array<{ x: number; y: number; label?: string }>
}

export function normalizeQuestMap(value: unknown): QuestMap | null {
	if (value == null) return null
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid quest map')
	const map = value as Record<string, unknown>
	if (
		typeof map.map_id !== 'string' ||
		!map.map_id.trim() ||
		map.map_id.length > 100
	)
		throw new Error('Invalid map id')
	if (
		map.map_name != null &&
		(typeof map.map_name !== 'string' || map.map_name.length > 200)
	)
		throw new Error('Invalid map name')
	if (!Array.isArray(map.markers) || map.markers.length > 100)
		throw new Error('Invalid markers')
	const markers = map.markers.map((raw) => {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw))
			throw new Error('Invalid marker')
		const marker = raw as Record<string, unknown>
		if (
			typeof marker.x !== 'number' ||
			!Number.isFinite(marker.x) ||
			typeof marker.y !== 'number' ||
			!Number.isFinite(marker.y)
		)
			throw new Error('Invalid marker coordinates')
		if (
			marker.label != null &&
			(typeof marker.label !== 'string' || marker.label.length > 200)
		)
			throw new Error('Invalid marker label')
		return {
			x: marker.x,
			y: marker.y,
			...(marker.label ? { label: marker.label } : {}),
		}
	})
	return {
		map_id: map.map_id.trim(),
		...(map.map_name ? { map_name: map.map_name as string } : {}),
		markers,
	}
}

function detectedMime(buffer: Uint8Array): keyof typeof MIME_EXTENSIONS | null {
	return detectImageMime(buffer)
}

export function validateArticleImage(file: File, buffer: Uint8Array) {
	if (!buffer.length || buffer.length > ARTICLE_IMAGE_MAX_BYTES)
		throw new Error('Image must be between 1 byte and 10 MB')
	const actual = detectedMime(buffer)
	if (!actual || !(file.type in MIME_EXTENSIONS) || actual !== file.type)
		throw new Error('Unsupported or mismatched image type')
	return MIME_EXTENSIONS[actual]
}

export function assertArticleImageQuota(
	existingSizes: number[],
	incomingBytes: number
) {
	if (
		!Number.isSafeInteger(incomingBytes) ||
		incomingBytes < 0 ||
		existingSizes.some((size) => !Number.isSafeInteger(size) || size < 0)
	)
		throw new Error('Invalid article image size')
	if (existingSizes.length >= ARTICLE_IMAGE_MAX_COUNT)
		throw new Error(
			`Article has reached the maximum number of ${ARTICLE_IMAGE_MAX_COUNT} images`
		)
	const storedBytes = existingSizes.reduce((total, size) => total + size, 0)
	if (storedBytes + incomingBytes > ARTICLE_IMAGE_TOTAL_MAX_BYTES)
		throw new Error('Article images exceed the 100 MB total size limit')
}

export async function saveArticleImage(articleId: number, file: File) {
	const raw = Buffer.from(await file.arrayBuffer())
	const extension = validateArticleImage(file, raw)
	// Recompress without resizing; gif passes through untouched.
	const buffer = await compressImageBuffer(raw, file.type)
	const relativeDir = `articles/${articleId}/image`
	const directory = resolve(process.cwd(), 'uploads', relativeDir)
	await mkdir(directory, { recursive: true })

	const entries = await readdir(directory, { withFileTypes: true })
	const storedSizes = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name !== '.upload.lock')
			.map(
				async (entry) =>
					(await stat(resolve(directory, entry.name))).size
			)
	)
	assertArticleImageQuota(storedSizes, buffer.length)

	const filename = `${randomUUID()}.${extension}`
	await writeFile(resolve(directory, filename), buffer, { flag: 'wx' })
	return `/uploads/${relativeDir}/${filename}`
}
