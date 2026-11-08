import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

// @/lib/uploads импортирует env, который требует обязательные переменные
// (LAUNCHER_*, ENCRYPT_KEY, JWT_SECRET, OPENAI_API_KEY, LOOT_KEY).
// Если они не заданы (CI, локальный запуск без .env), все тесты скипаются,
// вместо падения при парсинге env на этапе импорта.
const REQUIRED_ENV = [
	'LAUNCHER_SOURCES',
	'LAUNCHER_AUTH_QUERY',
	'ENCRYPT_KEY',
	'JWT_SECRET',
	'OPENAI_API_KEY',
	'LOOT_KEY',
]
const hasRequiredEnv = REQUIRED_ENV.every((key) => !!process.env[key])

describe.skipIf(!hasRequiredEnv)('uploads helpers', () => {
	let toS3Key: Awaited<typeof import('@/lib/uploads')>['toS3Key']
	let s3PublicUrl: Awaited<typeof import('@/lib/uploads')>['s3PublicUrl']
	let putUpload: Awaited<typeof import('@/lib/uploads')>['putUpload']
	let readUploadBytes: Awaited<
		typeof import('@/lib/uploads')
	>['readUploadBytes']
	let deleteUpload: Awaited<typeof import('@/lib/uploads')>['deleteUpload']
	let listUploadSizes: Awaited<
		typeof import('@/lib/uploads')
	>['listUploadSizes']
	let isS3Uploads: Awaited<typeof import('@/lib/uploads')>['isS3Uploads']

	beforeAll(async () => {
		const mod = await import('@/lib/uploads')
		toS3Key = mod.toS3Key
		s3PublicUrl = mod.s3PublicUrl
		putUpload = mod.putUpload
		readUploadBytes = mod.readUploadBytes
		deleteUpload = mod.deleteUpload
		listUploadSizes = mod.listUploadSizes
		isS3Uploads = mod.isS3Uploads
	})

	it('maps /uploads/... to key', () => {
		expect(toS3Key('/uploads/arts/x.png')).toBe('uploads/arts/x.png')
	})

	it('accepts stored form without leading slash', () => {
		expect(toS3Key('uploads/screenshots/a.png')).toBe(
			'uploads/screenshots/a.png'
		)
	})

	it('rejects traversal and foreign paths', () => {
		expect(toS3Key('/uploads/../etc/passwd')).toBeNull()
		expect(toS3Key('/etc/passwd')).toBeNull()
		expect(toS3Key('/other/x.png')).toBeNull()
		expect(toS3Key('')).toBeNull()
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
		process.env.S3_TEST_ENABLED === '1' &&
		process.env.S3_UPLOADS_ENABLED === 'true' &&
		hasRequiredEnv
			? describe
			: describe.skip

	integration('s3 integration (real bucket)', () => {
		const prefix = `uploads/__test__/${Date.now()}`
		const publicPath = `/${prefix}/hello.txt`
		const payload = Buffer.from(`smoke-${Date.now()}`)

		it('s3 mode is on', () => {
			expect(isS3Uploads()).toBe(true)
		})

		it('put -> read roundtrip', async () => {
			await putUpload(publicPath, payload, 'text/plain')
			const back = await readUploadBytes(publicPath)
			expect(back).not.toBeNull()
			expect(Buffer.from(back!).equals(payload)).toBe(true)
		}, 30_000)

		it('list sizes sees the object', async () => {
			const sizes = await listUploadSizes(prefix)
			expect(sizes).toContain(payload.length)
		}, 30_000)

		it('delete removes, redelete is idempotent', async () => {
			await deleteUpload(publicPath)
			expect(await readUploadBytes(publicPath)).toBeNull()
			await deleteUpload(publicPath)
			const sizes = await listUploadSizes(prefix)
			expect(sizes).toHaveLength(0)
		}, 30_000)

		afterAll(async () => {
			await deleteUpload(publicPath)
		})
	})
})
