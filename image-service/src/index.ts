import sharp from 'sharp'

const PORT = Number(process.env.PORT) || 3002
const MAX_BYTES = Number(process.env.IMAGE_MAX_BYTES) || 20 * 1024 * 1024

const TEXT_DECODER = new TextDecoder()

type CompressibleMime = 'image/jpeg' | 'image/png' | 'image/webp'

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
	const pipeline = sharp(input).rotate()
	let output: Buffer
	if (mime === 'image/jpeg')
		output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
	else if (mime === 'image/png')
		output = await pipeline
			.png({ quality: 80, compressionLevel: 9, palette: true })
			.toBuffer()
	else output = await pipeline.webp({ quality: 80 }).toBuffer()
	// Never inflate already-optimized files.
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
				return new Response(output, {
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

		return Response.json({ error: 'Not found' }, { status: 404 })
	},
})

console.log(`image-service listening on :${PORT}`)
