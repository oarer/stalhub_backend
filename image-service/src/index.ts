import sharp from 'sharp'

const PORT = Number(process.env.PORT) || 3002
const MAX_BYTES = Number(process.env.IMAGE_MAX_BYTES) || 20 * 1024 * 1024

const MAX_DIMENSION = Number(process.env.IMAGE_MAX_DIMENSION) || 2048

const TEXT_DECODER = new TextDecoder()

type CompressibleMime = 'image/jpeg' | 'image/png' | 'image/webp'

function toBody(buffer: Buffer): Uint8Array<ArrayBuffer> {
	const copy = new Uint8Array(buffer.byteLength)
	copy.set(buffer)
	return copy
}

function detectMime(buffer: Uint8Array): CompressibleMime | 'image/gif' | null {
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

async function compress(
	input: Buffer,
	mime: CompressibleMime
): Promise<Buffer> {
	const pipeline = sharp(input).rotate().resize({
		width: MAX_DIMENSION,
		height: MAX_DIMENSION,
		fit: 'inside',
		withoutEnlargement: true,
	})
	let output: Buffer
	if (mime === 'image/jpeg')
		output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
	else if (mime === 'image/png')
		output = await pipeline
			.png({ quality: 80, compressionLevel: 6 })
			.toBuffer()
	else output = await pipeline.webp({ quality: 80 }).toBuffer()
	return output.length < input.length ? output : input
}

Bun.serve({
	port: PORT,
	async fetch(req) {
		const { pathname } = new URL(req.url)

		if (req.method === 'GET' && pathname === '/health')
			return Response.json({ ok: true })

		if (req.method === 'POST' && pathname === '/compress') {
			let file: unknown
			try {
				file = (await req.formData()).get('file')
			} catch {
				return Response.json(
					{ error: 'Invalid multipart body' },
					{ status: 400 }
				)
			}
			if (!(file instanceof File))
				return Response.json(
					{ error: 'file is required' },
					{ status: 400 }
				)
			if (file.size === 0 || file.size > MAX_BYTES)
				return Response.json(
					{
						error: `file must be between 1 byte and ${MAX_BYTES} bytes`,
					},
					{ status: 413 }
				)

			const input = Buffer.from(await file.arrayBuffer())
			const mime = detectMime(input)
			if (!mime)
				return Response.json(
					{ error: 'Unsupported image type' },
					{ status: 422 }
				)
			if (mime === 'image/gif')
				return Response.json(
					{ error: 'Animated images are stored as-is' },
					{ status: 422 }
				)

			try {
				const output = await compress(input, mime)
				return new Response(toBody(output), {
					headers: { 'Content-Type': mime },
				})
			} catch (err) {
				console.error('Compression failed:', err)
				return Response.json(
					{ error: 'Compression failed' },
					{ status: 500 }
				)
			}
		}

		if (req.method === 'POST' && pathname === '/svg-to-png') {
			const buf = Buffer.from(await req.arrayBuffer())
			if (!buf.length || buf.length > 5 * 1024 * 1024)
				return Response.json(
					{ error: 'SVG must be between 1 byte and 5 MB' },
					{ status: 413 }
				)
			const head = TEXT_DECODER.decode(buf.slice(0, 1024))
			if (!head.includes('<svg'))
				return Response.json(
					{ error: 'Request body is not SVG' },
					{ status: 422 }
				)
			try {
				const output = await sharp(buf, { density: 192 })
					.resize({
						width: 1200,
						height: 630,
						fit: 'contain',
						background: '#0a0a0c',
					})
					.png()
					.toBuffer()
				return new Response(toBody(output), {
					headers: { 'Content-Type': 'image/png' },
				})
			} catch (err) {
				console.error('SVG rasterization failed:', err)
				return Response.json(
					{ error: 'SVG rasterization failed' },
					{ status: 500 }
				)
			}
		}

		return Response.json({ error: 'Not found' }, { status: 404 })
	},
})

console.log(`image-service listening on :${PORT}`)
