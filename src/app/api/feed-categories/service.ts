import { prisma } from '@/lib/prisma'

export class FeedCategoryNotFoundError extends Error {
	constructor() {
		super('Feed category not found')
	}
}

export class FeedCategoryDuplicateError extends Error {
	constructor() {
		super('Feed category already exists')
	}
}

function uniqueSourceIds(sourceIds: number[] | undefined): number[] {
	return [
		...new Set(
			(sourceIds ?? []).filter((id) => Number.isSafeInteger(id) && id > 0)
		),
	]
}

function isUniqueViolation(error: unknown): boolean {
	return (error as { code?: string }).code === 'P2002'
}

async function categoryProjection(id: number) {
	const category = await prisma.feedCategory.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			enabled: true,
			position: true,
			created_at: true,
			updated_at: true,
			sources: { select: { source_id: true } },
		},
	})
	if (!category) return null
	const { sources, ...rest } = category
	return { ...rest, source_ids: sources.map((source) => source.source_id) }
}

export const feedCategoriesService = {
	async list() {
		const categories = await prisma.feedCategory.findMany({
			orderBy: [{ position: 'asc' }, { id: 'asc' }],
			select: {
				id: true,
				name: true,
				enabled: true,
				position: true,
				created_at: true,
				updated_at: true,
				sources: { select: { source_id: true } },
			},
		})
		return categories.map(({ sources, ...category }) => ({
			...category,
			source_ids: sources.map((source) => source.source_id),
		}))
	},

	async listPublic() {
		const categories = await prisma.feedCategory.findMany({
			where: { enabled: true, sources: { some: {} } },
			orderBy: [{ position: 'asc' }, { id: 'asc' }],
			select: {
				id: true,
				name: true,
				position: true,
				_count: { select: { sources: true } },
			},
		})
		return categories.map(({ _count, ...category }) => ({
			...category,
			sources_count: _count.sources,
		}))
	},

	async create(input: {
		name: string
		enabled?: boolean
		position?: number
		source_ids?: number[]
	}) {
		const name = input.name.trim()
		if (!name) throw new Error('Category name is required')
		const source_ids = uniqueSourceIds(input.source_ids)
		try {
			const category = await prisma.feedCategory.create({
				data: {
					name,
					enabled: input.enabled ?? true,
					position: input.position ?? 0,
					sources: {
						create: source_ids.map((source_id) => ({ source_id })),
					},
				},
			})
			return categoryProjection(category.id)
		} catch (error) {
			if (isUniqueViolation(error)) throw new FeedCategoryDuplicateError()
			throw error
		}
	},

	async update(
		id: number,
		input: {
			name?: string
			enabled?: boolean
			position?: number
			source_ids?: number[]
		}
	) {
		const existing = await prisma.feedCategory.findUnique({ where: { id } })
		if (!existing) throw new FeedCategoryNotFoundError()
		const data: {
			name?: string
			enabled?: boolean
			position?: number
		} = {}
		if (input.name !== undefined) {
			const name = input.name.trim()
			if (!name) throw new Error('Category name is required')
			data.name = name
		}
		if (input.enabled !== undefined) data.enabled = input.enabled
		if (input.position !== undefined) data.position = input.position
		const source_ids =
			input.source_ids !== undefined
				? uniqueSourceIds(input.source_ids)
				: undefined
		try {
			await prisma.$transaction(async (tx) => {
				await tx.feedCategory.update({ where: { id }, data })
				if (source_ids !== undefined) {
					await tx.feedSourceCategory.deleteMany({
						where: { category_id: id },
					})
					if (source_ids.length > 0) {
						await tx.feedSourceCategory.createMany({
							data: source_ids.map((source_id) => ({
								source_id,
								category_id: id,
							})),
						})
					}
				}
			})
			return categoryProjection(id)
		} catch (error) {
			if (isUniqueViolation(error)) throw new FeedCategoryDuplicateError()
			throw error
		}
	},

	async delete(id: number) {
		try {
			await prisma.feedCategory.delete({ where: { id } })
		} catch (error) {
			if ((error as { code?: string }).code === 'P2025')
				throw new FeedCategoryNotFoundError()
			throw error
		}
	},

	async get(id: number) {
		return categoryProjection(id)
	},
}
