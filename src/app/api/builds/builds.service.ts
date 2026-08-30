import { type Prisma, StarTargetType } from 'generated/prisma/client'
import { getRegionCache } from '@/app/api/artifacts/cache'
import { resolveArtifactPrice } from '@/app/api/artifacts/pricing'
import { contentViewsTotal } from '@/app/api/metrics'
import { prisma } from '@/lib/prisma'
import type { ArtifactAggregate } from '@/types/artifacts.type'
import type { BuildData } from '@/types/build.type'

const authorInclude = {
	author: {
		select: {
			id: true,
			name: true,
			username: true,
		},
	},
} satisfies Prisma.BuildInclude

function externalId() {
	return crypto.randomUUID().slice(0, 8)
}

function compress(data: BuildData): string {
	const compressed = Bun.deflateSync(
		new TextEncoder().encode(JSON.stringify(data))
	)

	return 'v1:' + Buffer.from(compressed).toString('base64')
}

export function decompress(raw: string): BuildData {
	if (raw.startsWith('v1:')) {
		const b64 = raw.slice(3)
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
		const json = Bun.inflateSync(bytes)
		return JSON.parse(new TextDecoder().decode(json))
	}
	return JSON.parse(raw)
}

const MAX_BUILD_SIZE = 50_000

const PRICE_REGION = 'RU'

const artQualityToQualityIndex: Record<string, number> = {
	ART_QUALITY_COMMON: 0,
	ART_QUALITY_UNCOMMON: 1,
	ART_QUALITY_SPECIAL: 2,
	ART_QUALITY_RARE: 3,
	ART_QUALITY_EXCLUSIVE: 4,
	ART_QUALITY_LEGENDARY: 5,
	ART_QUALITY_UNIQUE: 6,
}

const priceCache = new Map<
	number,
	{ price: number; build_updated_at: Date; aggregate_updated_at: string }
>()

const PRICE_CACHE_MAX = 3000

function cachedBuildPrice(
	build: { id: number; data: string; updated_at: Date },
	aggregate: ArtifactAggregate | null
): number {
	if (!aggregate) return 0

	const cached = priceCache.get(build.id)
	if (
		cached &&
		cached.build_updated_at.getTime() === build.updated_at.getTime() &&
		cached.aggregate_updated_at === aggregate.updated_at
	) {
		return cached.price
	}

	const data = decompress(build.data)
	let total = 0

	for (const art of data.arts ?? []) {
		const qlt = artQualityToQualityIndex[art.quality_class]
		if (qlt == null) continue

		const resolved = resolveArtifactPrice(
			aggregate,
			art.item_id,
			qlt,
			art.potential ?? 0
		)
		if (resolved.price != null) total += resolved.price
	}

	if (priceCache.size >= PRICE_CACHE_MAX) priceCache.clear()
	priceCache.set(build.id, {
		price: total,
		build_updated_at: build.updated_at,
		aggregate_updated_at: aggregate.updated_at,
	})

	return total
}

class BuildsService {
	async list(
		take: number,
		page: number,
		opts: {
			tags?: string[]
			sort?: 'newest' | 'stars' | 'price'
			price_min?: number
			price_max?: number
			author_id?: number
			user_id?: number
		} = {}
	) {
		const tags = opts.tags ?? []
		const sort = opts.sort ?? 'newest'
		const price_min = opts.price_min
		const price_max = opts.price_max

		const where = {
			...(tags.length && {
				OR: tags.map((tag) => ({
					tags: { contains: tag },
				})),
			}),
			...(opts.author_id !== undefined && { author_id: opts.author_id }),
		}

		const hasPriceFilter = price_min != null || price_max != null
		const needsFullScan =
			sort === 'price' || sort === 'stars' || hasPriceFilter

		const aggregate = await getRegionCache(PRICE_REGION)

		let rows: Array<
			Prisma.BuildGetPayload<{ include: typeof authorInclude }>
		>
		let totalCount: number
		let starCounts = new Map<number, number>()

		if (needsFullScan) {
			const all = await prisma.build.findMany({
				where,
				orderBy: { created_at: 'desc' },
				include: authorInclude,
			})

			starCounts = await this.starCounts(all.map((r) => r.id))

			let priced = all.map((row) => ({
				row,
				price: cachedBuildPrice(row, aggregate),
				stars: starCounts.get(row.id) ?? 0,
			}))

			if (price_min != null)
				priced = priced.filter((entry) => entry.price >= price_min)
			if (price_max != null)
				priced = priced.filter((entry) => entry.price <= price_max)

			if (sort === 'price') priced.sort((a, b) => b.price - a.price)
			else if (sort === 'stars')
				priced.sort(
					(a, b) =>
						b.stars - a.stars ||
						a.row.created_at.getTime() - b.row.created_at.getTime()
				)

			totalCount = priced.length
			rows = priced
				.slice(page * take, page * take + take)
				.map((entry) => entry.row)
		} else {
			;[rows, totalCount] = await Promise.all([
				prisma.build.findMany({
					where,
					skip: page * take,
					take,
					orderBy: { created_at: 'desc' },
					include: authorInclude,
				}),
				prisma.build.count({ where }),
			])
			starCounts = await this.starCounts(rows.map((r) => r.id))
		}

		const ids = rows.map((r) => r.id)
		const pageStarCounts = needsFullScan
			? new Map(ids.map((id) => [id, starCounts.get(id) ?? 0]))
			: starCounts

		let starredIds = new Set<number>()
		if (opts.user_id) {
			starredIds = await this.userStarredIds(opts.user_id, ids)
		}

		return {
			data: rows.map((b) => ({
				id: b.id,
				external_id: b.external_id,
				title: b.title,
				data: decompress(b.data),
				flags: b.flags,
				tags: b.tags ? b.tags.split(',').filter(Boolean) : [],
				price: aggregate ? cachedBuildPrice(b, aggregate) : null,
				views: b.views,
				author: b.author,
				stars_count: pageStarCounts.get(b.id) ?? 0,
				is_starred: starredIds.has(b.id),
				created_at: b.created_at,
				updated_at: b.updated_at,
			})),
			total_count: totalCount,
			page: page + 1,
			take,
		}
	}

	async getById(id: string, user_id?: number) {
		const num = Number(id)
		const build = await prisma.build.findFirst({
			where: isNaN(num)
				? { external_id: id }
				: { OR: [{ external_id: id }, { id: num }] },
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		if (!build) return null

		await prisma.build.update({
			where: { id: build.id },
			data: { views: { increment: 1 } },
		})
		contentViewsTotal.inc({ type: 'build' })

		const stars_count = await prisma.star.count({
			where: { target_type: StarTargetType.BUILD, target_id: build.id },
		})

		let is_starred = false
		if (user_id) {
			const star = await prisma.star.findUnique({
				where: {
					target_type_target_id_user_id: {
						target_type: StarTargetType.BUILD,
						target_id: build.id,
						user_id,
					},
				},
			})
			is_starred = !!star
		}

		return {
			id: build.id,
			external_id: build.external_id,
			title: build.title,
			data: decompress(build.data),
			flags: build.flags,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			views: build.views + 1,
			author: build.author,
			stars_count,
			is_starred,
			created_at: build.created_at,
			updated_at: build.updated_at,
		}
	}

	async create(
		author_id: number,
		data: {
			title: string
			data: BuildData
			flags?: number
			tags?: string
		}
	) {
		const compressed = compress(data.data)
		if (compressed.length > MAX_BUILD_SIZE) {
			return { error: 'Build data exceeds maximum size' }
		}

		const build = await prisma.build.create({
			data: {
				external_id: externalId(),
				title: data.title,
				data: compressed,
				flags: data.flags ?? 0,
				tags: data.tags ?? '',
				author_id,
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		return {
			id: build.id,
			external_id: build.external_id,
			title: build.title,
			data: decompress(build.data),
			flags: build.flags,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			author: build.author,
			stars_count: 0,
			is_starred: false,
			created_at: build.created_at,
			updated_at: build.updated_at,
		}
	}

	async update(
		id: number,
		author_id: number,
		is_admin: boolean,
		data: {
			title?: string
			data?: BuildData
			flags?: number
			tags?: string
		}
	) {
		const existing = await prisma.build.findUnique({ where: { id } })
		if (!existing) return null
		if (existing.author_id !== author_id && !is_admin)
			return { error: 'Forbidden' }

		const updateData: Record<string, unknown> = {}
		if (data.title !== undefined) updateData.title = data.title
		if (data.data !== undefined) {
			const compressed = compress(data.data)
			if (compressed.length > MAX_BUILD_SIZE) {
				return { error: 'Build data exceeds maximum size' }
			}
			updateData.data = compressed
		}
		if (data.flags !== undefined) updateData.flags = data.flags
		if (data.tags !== undefined) updateData.tags = data.tags

		const build = await prisma.build.update({
			where: { id },
			data: updateData,
			include: {
				author: { select: { id: true, name: true, username: true } },
			},
		})

		const stars_count = await prisma.star.count({
			where: { target_type: StarTargetType.BUILD, target_id: build.id },
		})

		return {
			id: build.id,
			external_id: build.external_id,
			title: build.title,
			data: decompress(build.data),
			flags: build.flags,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			author: build.author,
			stars_count,
			created_at: build.created_at,
			updated_at: build.updated_at,
		}
	}

	async delete(id: number, author_id: number, is_admin: boolean) {
		const existing = await prisma.build.findUnique({ where: { id } })
		if (!existing) return false
		if (existing.author_id !== author_id && !is_admin) return false
		await prisma.build.delete({ where: { id } })
		return true
	}

	async addStar(buildId: number, user_id: number) {
		await prisma.star.upsert({
			where: {
				target_type_target_id_user_id: {
					target_type: StarTargetType.BUILD,
					target_id: buildId,
					user_id,
				},
			},
			create: {
				target_type: StarTargetType.BUILD,
				target_id: buildId,
				user_id,
			},
			update: {},
		})
	}

	async removeStar(buildId: number, user_id: number) {
		await prisma.star.deleteMany({
			where: {
				target_type: StarTargetType.BUILD,
				target_id: buildId,
				user_id,
			},
		})
	}

	private async starCounts(ids: number[]) {
		if (!ids.length) return new Map<number, number>()

		const rows = await prisma.star.groupBy({
			by: ['target_id'],
			where: { target_type: StarTargetType.BUILD, target_id: { in: ids } },
			_count: { target_id: true },
		})

		const map = new Map<number, number>()
		for (const r of rows) map.set(r.target_id, r._count.target_id)
		return map
	}

	private async userStarredIds(user_id: number, ids: number[]) {
		if (!ids.length) return new Set<number>()

		const rows = await prisma.star.findMany({
			where: {
				target_type: StarTargetType.BUILD,
				target_id: { in: ids },
				user_id,
			},
			select: { target_id: true },
		})

		return new Set(rows.map((r) => r.target_id))
	}
}

export const buildsService = new BuildsService()
