import { rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { S3Client } from 'bun'
import { env } from '@/env'

const LOCAL_UPLOADS_DIR = resolve(process.cwd(), 'uploads')

export const isS3Uploads = () =>
	env.S3_UPLOADS_ENABLED && env.S3_UPLOADS_BUCKET.length > 0

let s3: S3Client | null = null
function s3client(): S3Client {
	if (!s3) {
		s3 = new S3Client({
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_SECRET_ACCESS_KEY,
			bucket: env.S3_UPLOADS_BUCKET,
			endpoint: env.S3_ENDPOINT,
			region: env.S3_REGION,
		})
	}
	return s3
}

export function toS3Key(publicPath: string): string | null {
	const p = publicPath.startsWith('/') ? publicPath : `/${publicPath}`
	if (!p.startsWith('/uploads/') || p.includes('..')) {
		return null
	}
	return p.replace(/^\/+/, '')
}

export function s3PublicBase(): string {
	if (env.S3_PUBLIC_BASE_URL) return env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')
	const host = env.S3_ENDPOINT.replace(/\/$/, '').replace(/^https?:\/\//, '')
	return `https://${env.S3_UPLOADS_BUCKET}.${host}`
}

export function s3PublicUrl(publicPath: string): string | null {
	const key = toS3Key(publicPath)
	if (!key) return null
	return `${s3PublicBase()}/${key}`
}

export async function putUpload(
	publicPath: string,
	buffer: Buffer,
	contentType: string
): Promise<void> {
	if (!isS3Uploads()) {
		const abs = resolve(process.cwd(), publicPath.replace(/^\/+/, ''))
		if (
			abs !== LOCAL_UPLOADS_DIR &&
			!abs.startsWith(LOCAL_UPLOADS_DIR + '/')
		) {
			throw new Error('Upload path escape blocked')
		}
		try {
			await writeFile(abs, buffer, { flag: 'wx' })
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				const { mkdir } = await import('node:fs/promises')
				await mkdir(dirname(abs), { recursive: true })
				await writeFile(abs, buffer, { flag: 'wx' })
				return
			}
			throw err
		}
		return
	}
	const key = toS3Key(publicPath)
	if (!key) throw new Error('Upload path escape blocked')
	await s3client().write(key, buffer, { type: contentType })
}

export async function deleteUpload(publicPath: string): Promise<void> {
	if (!isS3Uploads()) {
		const abs = resolve(process.cwd(), publicPath.replace(/^\/+/, ''))
		if (
			abs !== LOCAL_UPLOADS_DIR &&
			!abs.startsWith(LOCAL_UPLOADS_DIR + '/')
		) {
			return
		}
		await rm(abs, { force: true }).catch(() => {})
		return
	}
	const key = toS3Key(publicPath)
	if (!key) return
	await s3client()
		.delete(key)
		.catch(() => {})
}

export async function readUploadBytes(
	publicPath: string
): Promise<Buffer | null> {
	try {
		if (!isS3Uploads()) {
			const abs = resolve(process.cwd(), publicPath.replace(/^\/+/, ''))
			if (
				abs !== LOCAL_UPLOADS_DIR &&
				!abs.startsWith(LOCAL_UPLOADS_DIR + '/')
			) {
				return null
			}
			const file = Bun.file(abs)
			if (!(await file.exists())) return null
			return Buffer.from(await file.arrayBuffer())
		}
		const key = toS3Key(publicPath)
		if (!key) return null
		const buf = await s3client().file(key).arrayBuffer()
		return Buffer.from(buf)
	} catch {
		return null
	}
}

export async function listUploadSizes(prefixKey: string): Promise<number[]> {
	if (!isS3Uploads()) {
		const { readdir, stat } = await import('node:fs/promises')
		const dir = resolve(process.cwd(), prefixKey)
		if (
			dir !== LOCAL_UPLOADS_DIR &&
			!dir.startsWith(LOCAL_UPLOADS_DIR + '/')
		) {
			return []
		}
		const entries = await readdir(dir, { withFileTypes: true }).catch(
			() => []
		)
		const sizes: number[] = []
		for (const entry of entries) {
			if (!entry.isFile()) continue
			try {
				sizes.push((await stat(join(dir, entry.name))).size)
			} catch {}
		}
		return sizes
	}
	const client = s3client()
	const prefix = prefixKey.endsWith('/') ? prefixKey : `${prefixKey}/`
	const sizes: number[] = []
	let startAfter: string | undefined
	for (;;) {
		const page = await client.list({ prefix, maxKeys: 500, startAfter })
		for (const obj of page.contents ?? []) {
			if (typeof obj.size === 'number') sizes.push(obj.size)
		}
		if (!page.isTruncated || !page.contents?.length) break
		const last = page.contents[page.contents.length - 1]
		if (!last?.key) break
		startAfter = last.key
	}
	return sizes
}
