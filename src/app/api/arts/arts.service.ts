import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Prisma } from 'generated/prisma/client'
import { ArtType, StarTargetType } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { generateSlug } from '@/utils/slug'
import { type ArtAuthorPayload, resolveArtAuthor } from './art-author'

type ArtData = {
	id: number
	external_id: string
	type: ArtType
	title: string
	image_url: string | null
	tags: string[]
	author: ArtAuthorPayload
	stars_count: number
	comments_count: number
	is_starred?: boolean
	created_at: Date
	updated_at: Date
}

class ArtsService {
	private mapArt(
		art: {
			id: number
			external_id: string
			type: ArtType
			title: string
			image_url: string | null
			tags: string
			author: {
				id: number
				name: string
				username: string
				social_links: unknown
			} | null
			author_name: string | null
			author_social_links: unknown
			created_at: Date
			updated_at: Date
		},
		starsCount: number,
		isStarred = false,
		commentsCount = 0
	): ArtData {
		return {
			id: art.id,
			external_id: art.external_id,
			type: art.type,
			title: art.title,
			image_url: art.image_url,
			tags: art.tags ? art.tags.split(',').filter(Boolean) : [],
			author: resolveArtAuthor(art),
			stars_count: starsCount,
			comments_count: commentsCount,
			is_starred: isStarred,
			created_at: art.created_at,
			updated_at: art.updated_at,
		}
	}

	async list(
		take: number,
		page: number,
		opts?: { authorId?: number; tags?: string[]; type?: ArtType }
	) {
		const where: Prisma.ArtWhereInput = {}
		if (opts?.authorId) where.authorId = opts.authorId
		if (opts?.type) where.type = opts.type
		if (opts?.tags?.length) {
			where.OR = opts.tags.map((tag) => ({
				tags: { contains: tag },
			}))
		}

		const [rows, totalCount] = await Promise.all([
			prisma.art.findMany({
				where,
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: {
							id: true,
							name: true,
							username: true,
							social_links: true,
						},
					},
				},
			}),
			prisma.art.count({ where }),
		])

		const ids = rows.map((r) => r.id)
		const starCounts = await this.starCounts(ids)

		return {
			data: rows.map((a) => this.mapArt(a, starCounts.get(a.id) ?? 0)),
			totalCount,
		}
	}

	async getById(id: string, userId?: number) {
		const num = Number(id)
		const art = await prisma.art.findFirst({
			where: isNaN(num)
				? { external_id: id }
				: { OR: [{ external_id: id }, { id: num }] },
			include: {
				author: {
					select: {
						id: true,
						name: true,
						username: true,
						social_links: true,
					},
				},
			},
		})

		if (!art) return null

		const stars_count = await prisma.star.count({
			where: { targetType: StarTargetType.ART, targetId: art.id },
		})

		let is_starred = false
		if (userId) {
			const star = await prisma.star.findUnique({
				where: {
					targetType_targetId_userId: {
						targetType: StarTargetType.ART,
						targetId: art.id,
						userId,
					},
				},
			})
			is_starred = !!star
		}

		const comments_count = await prisma.articleComment.count({
			where: { artId: art.id },
		})

		return this.mapArt(art, stars_count, is_starred, comments_count)
	}

	async saveArtMedia(file: { name: string; type: string; buffer: Buffer }) {
		const artDir = './uploads/arts'
		await mkdir(artDir, { recursive: true })

		const ext = path.extname(file.name) || '.png'
		const filename = `${randomUUID()}${ext}`
		await writeFile(path.join(artDir, filename), file.buffer)

		return { image_url: `/uploads/arts/${filename}` }
	}

	async create(
		authorId: number,
		data: {
			title: string
			type?: string
			tags?: string
			image_url?: string
		}
	) {
		const artType = (data.type as ArtType) ?? ArtType.DEFAULT

		const art = await prisma.art.create({
			data: {
				external_id: generateSlug(data.title),
				title: data.title,
				type: artType,
				image_url: data.image_url ?? undefined,
				tags: data.tags ?? '',
				authorId,
			},
			include: {
				author: {
					select: {
						id: true,
						name: true,
						username: true,
						social_links: true,
					},
				},
			},
		})

		return this.mapArt(art, 0)
	}

	async update(
		id: number,
		authorId: number,
		isAdmin: boolean,
		data: {
			title?: string
			type?: string
			tags?: string
			image_url?: string | null
		}
	) {
		const existing = await prisma.art.findUnique({ where: { id } })
		if (!existing) return null
		if (existing.authorId !== authorId && !isAdmin)
			return { error: 'Forbidden' }

		const updateData: Record<string, unknown> = {}
		if (data.title !== undefined) updateData.title = data.title
		if (data.type !== undefined) updateData.type = data.type
		if (data.tags !== undefined) updateData.tags = data.tags
		if (data.image_url !== undefined) updateData.image_url = data.image_url

		const art = await prisma.art.update({
			where: { id },
			data: updateData,
			include: {
				author: {
					select: {
						id: true,
						name: true,
						username: true,
						social_links: true,
					},
				},
			},
		})

		const stars_count = await prisma.star.count({
			where: { targetType: StarTargetType.ART, targetId: art.id },
		})

		return this.mapArt(art, stars_count)
	}

	async delete(id: number, authorId: number, isAdmin: boolean) {
		const existing = await prisma.art.findUnique({ where: { id } })
		if (!existing) return false
		if (existing.authorId !== authorId && !isAdmin) return false
		await prisma.art.delete({ where: { id } })
		return true
	}

	async addStar(artId: number, userId: number) {
		await prisma.star.upsert({
			where: {
				targetType_targetId_userId: {
					targetType: StarTargetType.ART,
					targetId: artId,
					userId,
				},
			},
			create: {
				targetType: StarTargetType.ART,
				targetId: artId,
				userId,
			},
			update: {},
		})
	}

	async removeStar(artId: number, userId: number) {
		await prisma.star.deleteMany({
			where: {
				targetType: StarTargetType.ART,
				targetId: artId,
				userId,
			},
		})
	}

	private async starCounts(ids: number[]) {
		if (!ids.length) return new Map<number, number>()

		const rows = await prisma.star.groupBy({
			by: ['targetId'],
			where: {
				targetType: StarTargetType.ART,
				targetId: { in: ids },
			},
			_count: { targetId: true },
		})

		const map = new Map<number, number>()
		for (const r of rows) map.set(r.targetId, r._count.targetId)
		return map
	}
}

export const artsService = new ArtsService()
