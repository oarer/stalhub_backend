import type { Prisma } from 'generated/prisma/client'
import {
	ArtType,
	Prisma as PrismaClient,
	StarTargetType,
} from 'generated/prisma/client'
import { resolveArtAuthor } from '@/app/api/arts/art-author'
import { prisma } from '@/lib/prisma'
import { generateSlug } from '@/utils/slug'

class AdminArtsService {
	async list(
		take: number,
		page: number,
		search?: string,
		type?: ArtType,
		tags?: string[]
	) {
		const where: Prisma.ArtWhereInput = {}

		if (type) where.type = type

		if (tags?.length) {
			where.OR = tags.map((tag) => ({
				tags: { contains: tag },
			}))
		}

		if (search) {
			const searchOr: Prisma.ArtWhereInput['OR'] = [
				{ title: { contains: search, mode: 'insensitive' } },
				{ author_name: { contains: search, mode: 'insensitive' } },
				{ author: { name: { contains: search, mode: 'insensitive' } } },
				{
					author: {
						username: { contains: search, mode: 'insensitive' },
					},
				},
			]
			where.OR = where.OR ? [{ OR: where.OR }, ...searchOr] : searchOr
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
					_count: { select: { comments: true } },
				},
			}),
			prisma.art.count({ where }),
		])

		const ids = rows.map((r) => r.id)
		const starCounts = await this.starCounts(ids)

		return {
			data: rows.map((a) => ({
				id: a.id,
				external_id: a.external_id,
				type: a.type,
				title: a.title,
				image_url: a.image_url,
				tags: a.tags ? a.tags.split(',').filter(Boolean) : [],
				author: resolveArtAuthor(a),
				stars_count: starCounts.get(a.id) ?? 0,
				comments_count: a._count.comments,
				created_at: a.created_at,
				updated_at: a.updated_at,
			})),
			totalCount,
		}
	}

	async get(id: number) {
		const art = await prisma.art.findUnique({
			where: { id },
			include: {
				author: {
					select: {
						id: true,
						name: true,
						username: true,
						social_links: true,
					},
				},
				_count: { select: { comments: true } },
			},
		})

		if (!art) return null

		const stars_count = await prisma.star.count({
			where: { targetType: StarTargetType.ART, targetId: art.id },
		})

		return {
			id: art.id,
			external_id: art.external_id,
			type: art.type,
			title: art.title,
			image_url: art.image_url,
			tags: art.tags ? art.tags.split(',').filter(Boolean) : [],
			author: resolveArtAuthor(art),
			stars_count,
			comments_count: art._count.comments,
			created_at: art.created_at,
			updated_at: art.updated_at,
		}
	}

	async create(data: {
		title: string
		type?: string
		image_url?: string | null
		tags?: string
		authorId?: number
		author_name?: string
		author_social_links?: Record<string, string>
	}) {
		const artType = (data.type as ArtType) ?? ArtType.DEFAULT

		const createData: Prisma.ArtCreateInput = {
			external_id: generateSlug(data.title),
			title: data.title,
			type: artType,
			image_url: data.image_url ?? undefined,
			tags: data.tags ?? '',
		}

		if (data.authorId) {
			createData.author = { connect: { id: data.authorId } }
		} else if (data.author_name) {
			createData.author_name = data.author_name
			createData.author_social_links =
				data.author_social_links ?? undefined
		}

		return prisma.art.create({
			data: createData,
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
	}

	async update(
		id: number,
		data: {
			title?: string
			type?: string
			image_url?: string | null
			tags?: string
			authorId?: number | null
			author_name?: string | null
			author_social_links?: Record<string, string> | null
		}
	) {
		const existing = await prisma.art.findUnique({ where: { id } })
		if (!existing) return null

		const updateData: Prisma.ArtUpdateInput = {}
		if (data.title !== undefined) updateData.title = data.title
		if (data.type !== undefined) updateData.type = data.type as ArtType
		if (data.image_url !== undefined) updateData.image_url = data.image_url
		if (data.tags !== undefined) updateData.tags = data.tags

		if (data.authorId !== undefined) {
			updateData.author = data.authorId
				? { connect: { id: data.authorId } }
				: { disconnect: true }
			if (!data.authorId) {
				if (data.author_name !== undefined)
					updateData.author_name = data.author_name
				if (data.author_social_links !== undefined)
					updateData.author_social_links =
						data.author_social_links ?? PrismaClient.DbNull
			}
		}

		if (data.authorId === undefined && data.author_name !== undefined) {
			updateData.author_name = data.author_name
		}
		if (
			data.authorId === undefined &&
			data.author_social_links !== undefined
		) {
			updateData.author_social_links =
				data.author_social_links ?? PrismaClient.DbNull
		}

		return prisma.art.update({
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
	}

	async remove(id: number) {
		const existing = await prisma.art.findUnique({ where: { id } })
		if (!existing) return false

		await prisma.art.delete({ where: { id } })
		return true
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

export const adminArtsService = new AdminArtsService()
