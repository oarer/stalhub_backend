import { env } from '@/env'

export const IMAGE_MIME_EXTENSIONS = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
} as const

export type ImageMime = keyof typeof IMAGE_MIME_EXTENSIONS

const TEXT_DECODER = new TextDecoder()

export function detectImageMime(buffer: Uint8Array): ImageMime | null {
	if (
		buffer.length >= 3 &&
		buffer[0] === 0xff &&
		buffer[1] === 0xd8 &&
		buffer[2] === 0xff
	)
		return 'image/jpeg'
	if (
		buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a
	)
		return 'image/png'
	if (
		buffer.length >= 12 &&
		TEXT_DECODER.decode(buffer.slice(0, 4)) === 'RIFF' &&
		TEXT_DECODER.decode(buffer.slice(8, 12)) === 'WEBP'
	)
		return 'image/webp'
	if (
		buffer.length >= 6 &&
		['GIF87a', 'GIF89a'].includes(TEXT_DECODER.decode(buffer.slice(0, 6)))
	)
		return 'image/gif'
	return null
}

export function isCompressibleImageMime(mime: string): boolean {
	return (
		mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp'
	)
}

export async function compressImageBuffer(
	input: Buffer,
	mime: ImageMime | string
): Promise<Buffer> {
	if (!isCompressibleImageMime(mime)) return input
	try {
		const baseUrl = env.IMAGE_SERVICE_URL.replace(/\/$/, '')
		const form = new FormData()
		form.append('file', new Blob([input], { type: mime }), 'image')
		const res = await fetch(`${baseUrl}/compress`, {
			method: 'POST',
			body: form,
			signal: AbortSignal.timeout(env.IMAGE_SERVICE_TIMEOUT_MS),
		})
		if (!res.ok) throw new Error(`image-service responded ${res.status}`)
		const output = Buffer.from(await res.arrayBuffer())
		if (!output.length) throw new Error('image-service returned empty body')
		return output.length < input.length ? output : input
	} catch (err) {
		console.warn('Image compression failed, storing original:', err)
		return input
	}
}
