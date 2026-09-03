import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Prisma } from 'generated/prisma/client'
import { ArtType, StarTargetType } from 'generated/prisma/client'
import { contentViewsTotal } from '@/app/api/metrics'
import {
	recordContentView,
	type ViewIdentity,
} from '@/app/api/metrics/view-dedupe'
import { prisma } from '@/lib/prisma'
import { generateSlug } from '@/utils/slug'
import { type ArtAuthorPayload, resolveArtAuthor } from './art-author'

type ArtData = {
	id: number
	external_id: string
	type: ArtType
	title: string | null
	description: string | null
	image_url: string | null
	tags: string[]
	views: number
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
			title: string | null
			description: string | null
			image_url: string | null
			tags: string
			views: number
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
		stars_count: number,
		isStarred = false,
		commentsCount = 0
	): ArtData {
		return {
			id: art.id,
			external_id: art.external_id,
			type: art.type,
			title: art.title,
			description: art.description,
			image_url: art.image_url,
			tags: art.tags ? art.tags.split(',').filter(Boolean) : [],
			views: art.views,
			author: resolveArtAuthor(art),
			stars_count: stars_count,
			comments_count: commentsCount,
			is_starred: isStarred,
			created_at: art.created_at,
			updated_at: art.updated_at,
		}
	}

	async list(
		take: number,
		page: number,
		opts?: { author_id?: number; tags?: string[]; type?: ArtType }
	) {
		const where: Prisma.ArtWhereInput = {}
		if (opts?.author_id) where.author_id = opts.author_id
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
			total_count: totalCount,
			page: page + 1,
			take,
		}
	}

	async getById(id: string, user_id?: number, identity: ViewIdentity = {}) {
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

		const counted = await recordContentView('ART', art.id, {
			...identity,
			userId: user_id,
		})
		if (counted) {
			await prisma.art.update({
				where: { id: art.id },
				data: { views: { increment: 1 } },
			})
			contentViewsTotal.inc({ type: 'art' })
		}

		const stars_count = await prisma.star.count({
			where: { target_type: StarTargetType.ART, target_id: art.id },
		})

		let is_starred = false
		if (user_id) {
			const star = await prisma.star.findUnique({
				where: {
					target_type_target_id_user_id: {
						target_type: StarTargetType.ART,
						target_id: art.id,
						user_id,
					},
				},
			})
			is_starred = !!star
		}

		const comments_count = await prisma.articleComment.count({
			where: { art_id: art.id },
		})

		return this.mapArt(
			{ ...art, views: art.views + (counted ? 1 : 0) },
			stars_count,
			is_starred,
			comments_count
		)
	}

	private mediaTypeTag(image_url?: string): 'рисунок' | 'анимация' {
		if (!image_url) return 'рисунок'
		const ext = path.extname(image_url.split('?')[0]).toLowerCase()
		return ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)
			? 'анимация'
			: 'рисунок'
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
		author_id: number,
		data: {
			title?: string
			description?: string
			type?: string
			tags?: string
			image_url?: string
		}
	) {
		const artType = (data.type as ArtType) ?? ArtType.DEFAULT

		const author = await prisma.user.findUnique({
			where: { id: author_id },
			select: { name: true, username: true },
		})

		const autoTags = [
			author?.name || author?.username,
			this.mediaTypeTag(data.image_url),
		].filter((t): t is string => !!t)

		const manualTags = data.tags ? data.tags.split(',').filter(Boolean) : []
		const tags = [...new Set([...manualTags, ...autoTags])].join(',')

		const art = await prisma.art.create({
			data: {
				external_id: generateSlug(data.title ?? 'art'),
				title: data.title ?? null,
				description: data.description ?? null,
				type: artType,
				image_url: data.image_url ?? undefined,
				tags,
				author_id,
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
		author_id: number,
		is_admin: boolean,
		data: {
			title?: string | null
			description?: string | null
			type?: string
			tags?: string
			image_url?: string | null
		}
	) {
		const existing = await prisma.art.findUnique({ where: { id } })
		if (!existing) return null
		if (existing.author_id !== author_id && !is_admin)
			return { error: 'Forbidden' }

		const updateData: Record<string, unknown> = {}
		if (data.title !== undefined) updateData.title = data.title
		if (data.description !== undefined) updateData.description = data.description
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
			where: { target_type: StarTargetType.ART, target_id: art.id },
		})

		return this.mapArt(art, stars_count)
	}

	async delete(id: number, author_id: number, is_admin: boolean) {
		const existing = await prisma.art.findUnique({ where: { id } })
		if (!existing) return false
		if (existing.author_id !== author_id && !is_admin) return false
		await prisma.art.delete({ where: { id } })
		return true
	}

	async addStar(art_id: number, user_id: number) {
		await prisma.star.upsert({
			where: {
				target_type_target_id_user_id: {
					target_type: StarTargetType.ART,
					target_id: art_id,
					user_id,
				},
			},
			create: {
				target_type: StarTargetType.ART,
				target_id: art_id,
				user_id,
			},
			update: {},
		})
	}

	async removeStar(art_id: number, user_id: number) {
		await prisma.star.deleteMany({
			where: {
				target_type: StarTargetType.ART,
				target_id: art_id,
				user_id,
			},
		})
	}

	private async starCounts(ids: number[]) {
		if (!ids.length) return new Map<number, number>()

		const rows = await prisma.star.groupBy({
			by: ['target_id'],
			where: {
				target_type: StarTargetType.ART,
				target_id: { in: ids },
			},
			_count: { target_id: true },
		})

		const map = new Map<number, number>()
		for (const r of rows) map.set(r.target_id, r._count.target_id)
		return map
	}
}

export const artsService = new ArtsService()
