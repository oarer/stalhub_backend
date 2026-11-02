import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { prisma } from '@/lib/prisma'
import { access, audit, getOrder, transaction } from './data'
import { ensure } from './policy'

const maxBytes = 20 * 1024 * 1024
const types = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'application/pdf',
])
const selection = { id: true, name: true, mime: true, size: true } as const

async function directory() {
	const root = resolve(
		process.env.COMMISSION_FILES_DIR ?? 'private-commissions'
	)
	await mkdir(root, { recursive: true, mode: 0o700 })
	const actual = await realpath(root)
	const publicRoot = resolve('uploads')
	ensure(
		actual !== publicRoot && !actual.startsWith(publicRoot + sep),
		'PRIVATE_STORAGE_REQUIRED',
		500
	)
	return actual
}

export const files = {
	async cleanup() {
		const expired = await prisma.commissionFile.findMany({
			where: {
				order_id: null,
				created_at: { lt: new Date(Date.now() - 86400000) },
			},
			take: 100,
			select: { id: true },
		})
		if (!expired.length) return
		const root = await directory()
		for (const file of expired) {
			const deleted = await prisma.commissionFile.deleteMany({
				where: {
					id: file.id,
					order_id: null,
					created_at: { lt: new Date(Date.now() - 86400000) },
				},
			})
			if (deleted.count) await rm(resolve(root, file.id), { force: true })
		}
	},
	async upload(actor: number, file: File) {
		ensure(file.size > 0 && file.size <= maxBytes, 'FILE_TOO_LARGE', 413)
		await this.cleanup()
		const root = await directory()
		const bytes = Buffer.from(await file.arrayBuffer())
		const detected = await fileTypeFromBuffer(bytes)
		ensure(detected && types.has(detected.mime), 'INVALID_FILE_TYPE')
		const name =
			file.name.replace(/[\x00-\x1f\x7f/\\"<>]/g, '_').slice(0, 180) ||
			'file'
		const entry = await transaction(async (db) => {
			const recent = await db.commissionFile.aggregate({
				where: {
					owner_id: actor,
					created_at: { gt: new Date(Date.now() - 86400000) },
				},
				_count: { _all: true },
				_sum: { size: true },
			})
			ensure(
				recent._count._all < 100 &&
					(recent._sum.size ?? 0) + bytes.length <= 200 * 1024 * 1024,
				'UPLOAD_QUOTA',
				429
			)
			return db.commissionFile.create({
				data: {
					owner_id: actor,
					name,
					mime: detected.mime,
					size: bytes.length,
				},
				select: selection,
			})
		})
		try {
			await writeFile(resolve(root, entry.id), bytes, {
				flag: 'wx',
				mode: 0o600,
			})
		} catch (error) {
			await prisma.commissionFile.delete({ where: { id: entry.id } })
			throw error
		}
		return entry
	},
	async download(actor: number, id: string) {
		const entry = await prisma.commissionFile.findUnique({ where: { id } })
		ensure(entry, 'FILE_NOT_FOUND', 404)
		if (entry.order_id) {
			const order = await getOrder(prisma, entry.order_id)
			await access(prisma, order, actor)
			if (![order.artist_id, order.customer_id].includes(actor))
				await audit(prisma, actor, 'commission:file:view', entry.id)
		} else ensure(entry.owner_id === actor, 'FILE_NOT_FOUND', 404)
		ensure(/^[a-zA-Z0-9]+$/.test(entry.id), 'FILE_NOT_FOUND', 404)
		const file = Bun.file(resolve(await directory(), entry.id))
		ensure(await file.exists(), 'FILE_NOT_FOUND', 404)
		return new Response(file, {
			headers: {
				'Content-Type': entry.mime,
				'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
				'Content-Security-Policy': "default-src 'none'; sandbox",
			},
		})
	},
	async remove(actor: number, id: string) {
		const removed = await prisma.commissionFile.deleteMany({
			where: { id, owner_id: actor, order_id: null },
		})
		ensure(removed.count === 1, 'FILE_NOT_FOUND', 404)
		await rm(resolve(await directory(), id), { force: true })
		return { ok: true }
	},
}
