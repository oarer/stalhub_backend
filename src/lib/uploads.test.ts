import { afterAll, describe, expect, it } from 'bun:test'
import {
	deleteUpload,
	isS3Uploads,
	listUploadSizes,
	putUpload,
	readUploadBytes,
	s3PublicUrl,
	toS3Key,
} from './uploads'

describe('toS3Key', () => {
	it('maps /uploads/... to key', () => {
		expect(toS3Key('/uploads/arts/x.png')).toBe('uploads/arts/x.png')
	})

	it('accepts stored form without leading slash', () => {
		expect(toS3Key('uploads/screenshots/a.png')).toBe('uploads/screenshots/a.png')
	})

	it('rejects traversal and foreign paths', () => {
		expect(toS3Key('/uploads/../etc/passwd')).toBeNull()
		expect(toS3Key('/etc/passwd')).toBeNull()
		expect(toS3Key('/other/x.png')).toBeNull()
		expect(toS3Key('')).toBeNull()
	})
})

describe('s3PublicUrl', () => {
	it('builds virtual-hosted url', () => {
		const url = s3PublicUrl('/uploads/arts/x.png')
		expect(url).toContain('/uploads/arts/x.png')
		expect(url).toMatch(/^https:\/\//)
	})

	it('returns null for bad paths', () => {
		expect(s3PublicUrl('/uploads/../x')).toBeNull()
	})
})

const integration =
	process.env.S3_TEST_ENABLED === '1' ? describe : describe.skip

integration('s3 integration (real bucket)', () => {
	const prefix = `uploads/__test__/${Date.now()}`
	const publicPath = `/${prefix}/hello.txt`
	const payload = Buffer.from(`smoke-${Date.now()}`)

	it('s3 mode is on', () => {
		expect(isS3Uploads()).toBe(true)
	})

	it(
		'put -> read roundtrip',
		async () => {
			await putUpload(publicPath, payload, 'text/plain')
			const back = await readUploadBytes(publicPath)
			expect(back).not.toBeNull()
			expect(Buffer.from(back!).equals(payload)).toBe(true)
		},
		30_000
	)

	it(
		'list sizes sees the object',
		async () => {
			const sizes = await listUploadSizes(prefix)
			expect(sizes).toContain(payload.length)
		},
		30_000
	)

	it(
		'delete removes, redelete is idempotent',
		async () => {
			await deleteUpload(publicPath)
			expect(await readUploadBytes(publicPath)).toBeNull()
			await deleteUpload(publicPath)
			const sizes = await listUploadSizes(prefix)
			expect(sizes).toHaveLength(0)
		},
		30_000
	)

	afterAll(async () => {
		await deleteUpload(publicPath)
	})
})
