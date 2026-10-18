import axios from 'axios'
import { env } from '@/env'
import { readUploadBytes } from '@/lib/uploads'

export interface CoverImage {
	buffer: Buffer
	filename: string
	mime: string
}

export interface CoverResolveResult {
	cover: CoverImage | null
	coverError?: string
}

const FETCH_TIMEOUT_MS = 20_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function extFromMime(mime: string | undefined, fallback: string): string {
	if (mime?.includes('jpeg') || mime?.includes('jpg')) return 'jpg'
	if (mime?.includes('png')) return 'png'
	if (mime?.includes('webp')) return 'webp'
	if (mime?.includes('gif')) return 'gif'
	return fallback
}

async function fetchRemoteImage(url: string): Promise<CoverImage | null> {
	try {
		const res = await axios.get(url, {
			responseType: 'arraybuffer',
			timeout: FETCH_TIMEOUT_MS,
			maxContentLength: MAX_IMAGE_BYTES,
			maxBodyLength: MAX_IMAGE_BYTES,
		})
		const buffer = Buffer.from(res.data)
		if (!buffer.length) return null
		const mime =
			(res.headers['content-type'] as string | undefined) ?? 'image/jpeg'
		const ext =
			url.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/)?.[1] ??
			extFromMime(mime, 'jpg')
		return { buffer, filename: `cover.${ext}`, mime }
	} catch (err) {
		console.warn(
			`[BlogCover] Failed to fetch remote image: ${(err as Error).message}`
		)
		return null
	}
}

async function readLocalUpload(imageUrl: string): Promise<CoverImage | null> {
	try {
		const relative = imageUrl.replace(/^\/+/, '')

		if (
			relative !== 'uploads' &&
			!relative.startsWith('uploads/') &&
			!imageUrl.startsWith('/uploads/')
		) {
			console.warn(`[BlogCover] Blocked path escape: ${imageUrl}`)
			return null
		}
		const buffer = await readUploadBytes(imageUrl)
		if (!buffer || !buffer.length || buffer.length > MAX_IMAGE_BYTES)
			return null
		const ext = relative.split('.').pop() ?? 'jpg'
		return {
			buffer,
			filename: `cover.${ext}`,
			mime: mimeFromExt(ext),
		}
	} catch (err) {
		console.warn(
			`[BlogCover] Failed to read local upload: ${(err as Error).message}`
		)
		return null
	}
}

function mimeFromExt(ext: string): string {
	switch (ext.toLowerCase()) {
		case 'png':
			return 'image/png'
		case 'webp':
			return 'image/webp'
		case 'gif':
			return 'image/gif'
		case 'avif':
			return 'image/avif'
		default:
			return 'image/jpeg'
	}
}

function ogBaseCandidates(): string[] {
	const raw = [
		env.BLOG_OG_BASE_URL,
		env.WEB_ORIGIN,
		'http://host.docker.internal:3000',
		env.BLOG_PUBLIC_BASE_URL,
	]
		.map((u) => (u ?? '').trim().replace(/\/$/, ''))
		.filter(Boolean)
	return [...new Set(raw)]
}

function rasterServiceCandidates(): string[] {
	const raw = [
		env.IMAGE_SERVICE_URL,
		'http://image-service:3002',
		'http://localhost:3002',
	]
		.map((u) => (u ?? '').trim().replace(/\/$/, ''))
		.filter(Boolean)
	return [...new Set(raw)]
}

async function rasterSvgToPng(svg: string): Promise<Buffer> {
	const errors: string[] = []
	for (const base of rasterServiceCandidates()) {
		try {
			const pngRes = await fetch(`${base}/svg-to-png`, {
				method: 'POST',
				headers: { 'Content-Type': 'image/svg+xml' },
				body: svg,
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			})
			if (!pngRes.ok)
				throw new Error(`image-service responded ${pngRes.status}`)
			const buffer = Buffer.from(await pngRes.arrayBuffer())
			if (!buffer.length)
				throw new Error('image-service returned empty body')
			return buffer
		} catch (err) {
			errors.push(`${base}: ${(err as Error).message}`)
		}
	}
	throw new Error(errors.join(' | ') || 'no raster candidates')
}

async function renderOgCoverPng(
	articleId: string | number
): Promise<CoverImage> {
	const errors: string[] = []
	for (const base of ogBaseCandidates()) {
		try {
			const svgRes = await fetch(`${base}/api/og/${articleId}`, {
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			})
			if (!svgRes.ok)
				throw new Error(`OG route responded ${svgRes.status}`)
			const svg = await svgRes.text()
			if (!svg.includes('<svg'))
				throw new Error('OG route returned no SVG')
			const buffer = await rasterSvgToPng(svg)
			return {
				buffer,
				filename: `og-${articleId}.png`,
				mime: 'image/png',
			}
		} catch (err) {
			errors.push(`${base}: ${(err as Error).message}`)
		}
	}
	throw new Error(errors.join(' | ') || 'no OG candidates')
}

export async function resolveBlogCoverImage(article: {
	id: number
	external_id: string
	image_url: string | null
}): Promise<CoverResolveResult> {
	if (article.image_url) {
		if (article.image_url.startsWith('/uploads/')) {
			if (
				article.image_url.includes('..') ||
				article.image_url.includes('\0') ||
				article.image_url.includes('\\') ||
				!/^\/uploads\/[A-Za-z0-9\-_/]+\.(png|jpe?g|webp|gif|avif)$/i.test(
					article.image_url.split('?')[0] ?? ''
				)
			) {
				return { cover: null, coverError: 'invalid image_url' }
			}
			const local = await readLocalUpload(article.image_url)
			if (local) return { cover: local }
			return { cover: null, coverError: 'local upload not readable' }
		}
		if (/^https?:\/\//.test(article.image_url)) {
			const remote = await fetchRemoteImage(article.image_url)
			if (remote) return { cover: remote }
			return { cover: null, coverError: 'remote image fetch failed' }
		}
		return { cover: null, coverError: 'unsupported image_url' }
	}
	try {
		return {
			cover: await renderOgCoverPng(article.external_id || article.id),
		}
	} catch (err) {
		console.warn(
			`[BlogCover] Failed to render OG cover: ${(err as Error).message}`
		)
		return { cover: null, coverError: (err as Error).message }
	}
}
