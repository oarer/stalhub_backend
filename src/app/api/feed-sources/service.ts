import { prisma } from '@/lib/prisma'

type FeedSourceType = 'TG' | 'YOUTUBE'

export class FeedSourceNotFoundError extends Error {
	constructor() {
		super('Feed source not found')
	}
}

export class FeedSourceDuplicateError extends Error {
	constructor() {
		super('Feed source already exists')
	}
}

export function normalizeExternalId(type: FeedSourceType, raw: string): string {
	const value = raw.trim()
	if (type === 'TG') {
		const normalized = value.replace(/^@/, '')
		if (/^[A-Za-z0-9_]{4,64}$/.test(normalized)) return normalized
		if (/^\d+$/.test(normalized) || /^-100\d+$/.test(normalized))
			return normalized
		throw new Error(
			'TG external_id must be a channel username or numeric channel id'
		)
	}

	if (/^UC[0-9A-Za-z_-]{22}$/.test(value)) return value
	const match = value.match(
		/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})(?:[/?#].*)?$/i
	)
	if (match) return match[1]
	if (/(?:youtube\.com\/|youtu\.be\/)?@/i.test(value)) {
		throw new Error(
			'YouTube @handle URLs are not supported; provide a channel ID or /channel/UC... URL'
		)
	}
	throw new Error(
		'YouTube external_id must be a UC channel ID or a youtube.com/channel/UC... URL'
	)
}

function isUniqueViolation(error: unknown): boolean {
	return (error as { code?: string }).code === 'P2002'
}

export const feedSourcesService = {
	async list() {
		return prisma.feedSource.findMany({
			orderBy: [{ type: 'asc' }, { id: 'asc' }],
		})
	},

	async create(input: {
		type: FeedSourceType
		external_id: string
		label?: string
	}) {
		const external_id = normalizeExternalId(input.type, input.external_id)
		const label = input.label?.trim() || external_id
		try {
			return await prisma.feedSource.create({
				data: { type: input.type, external_id, label },
			})
		} catch (error) {
			if (isUniqueViolation(error)) throw new FeedSourceDuplicateError()
			throw error
		}
	},

	async update(
		id: number,
		input: {
			external_id?: string
			label?: string
			enabled?: boolean
		}
	) {
		const existing = await prisma.feedSource.findUnique({ where: { id } })
		if (!existing) throw new FeedSourceNotFoundError()
		const data: {
			external_id?: string
			label?: string
			enabled?: boolean
		} = {}
		if (input.external_id !== undefined) {
			data.external_id = normalizeExternalId(
				existing.type,
				input.external_id
			)
		}
		if (input.label !== undefined)
			data.label =
				input.label.trim() || data.external_id || existing.external_id
		if (input.enabled !== undefined) data.enabled = input.enabled
		try {
			return await prisma.feedSource.update({ where: { id }, data })
		} catch (error) {
			if (isUniqueViolation(error)) throw new FeedSourceDuplicateError()
			throw error
		}
	},

	async delete(id: number) {
		try {
			await prisma.feedSource.delete({ where: { id } })
		} catch (error) {
			if ((error as { code?: string }).code === 'P2025')
				throw new FeedSourceNotFoundError()
			throw error
		}
	},

	async get(id: number) {
		return prisma.feedSource.findUnique({ where: { id } })
	},
}
