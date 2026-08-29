import {
	TierItemKind,
	TierListKind,
	type TierRank,
} from 'generated/prisma/client'
import { contentViewsTotal } from '@/app/api/metrics'
import {
	recordContentView,
	type ViewIdentity,
} from '@/app/api/metrics/view-dedupe'
import { prisma } from '@/lib/prisma'
import { generateSlug } from '@/utils/slug'

function serialize(tierList: {
	id: number
	external_id: string
	title: string
	description: string
	views: number
	kind: TierListKind
	item_kind: TierItemKind
	scenario: string | null
	category: string | null
	is_public: boolean
	generated_at: Date | null
	is_current: boolean
	removed_at: Date | null
	created_at: Date
	updated_at: Date
	author: { id: number; name: string; username: string } | null
	entries: Array<{
		id: number
		item_id: string
		rank: TierRank
		ttk: number | null
		position: number
	}>
}) {
	return {
		id: tierList.id,
		external_id: tierList.external_id,
		title: tierList.title,
		description: tierList.description,
		views: tierList.views,
		kind: tierList.kind,
		item_kind: tierList.item_kind,
		scenario: tierList.scenario,
		category: tierList.category,
		is_public: tierList.is_public,
		generated_at: tierList.generated_at,
		is_current: tierList.is_current,
		removed_at: tierList.removed_at,
		author: tierList.author,
		entries: tierList.entries.map((e) => ({
			id: e.id,
			item_id: e.item_id,
			rank: e.rank,
			ttk: e.ttk,
			position: e.position,
		})),
		created_at: tierList.created_at,
		updated_at: tierList.updated_at,
	}
}

const AUTHOR_SELECT = {
	select: { id: true, name: true, username: true },
} as const

class TierListsService {
	async list(opts: {
		take: number
		page: number
		kind?: 'SYSTEM' | 'USER'
		item_kind?: 'ARMOR' | 'WEAPON'
		category?: string
		user_id?: number
	}) {
		const where = {
			is_public: true,
			...(opts.kind && { kind: opts.kind as TierListKind }),
			...(opts.item_kind && {
				item_kind: opts.item_kind as TierItemKind,
			}),
			...(opts.category && { category: opts.category }),
		}

		const [rows, totalCount] = await Promise.all([
			prisma.tierList.findMany({
				where,
				skip: opts.page * opts.take,
				take: opts.take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: { id: true, name: true, username: true },
					},
					_count: { select: { entries: true } },
				},
			}),
			prisma.tierList.count({ where }),
		])

		return {
			data: rows.map((r) => ({
				id: r.id,
				external_id: r.external_id,
				title: r.title,
				description: r.description,
				kind: r.kind,
				item_kind: r.item_kind,
				scenario: r.scenario,
				category: r.category,
				views: r.views,
				is_public: r.is_public,
				is_current: r.is_current,
				generated_at: r.generated_at,
				author: r.author,
				entry_count: r._count.entries,
				created_at: r.created_at,
				updated_at: r.updated_at,
			})),
			total_count: totalCount,
			page: opts.page + 1,
			take: opts.take,
		}
	}

	async listMine(user_id: number, take: number, page: number) {
		const where = { author_id: user_id }

		const [rows, totalCount] = await Promise.all([
			prisma.tierList.findMany({
				where,
				skip: page * take,
				take,
				orderBy: { created_at: 'desc' },
				include: {
					author: {
						select: { id: true, name: true, username: true },
					},
					_count: { select: { entries: true } },
				},
			}),
			prisma.tierList.count({ where }),
		])

		return {
			data: rows.map((r) => ({
				id: r.id,
				external_id: r.external_id,
				title: r.title,
				description: r.description,
				kind: r.kind,
				item_kind: r.item_kind,
				scenario: r.scenario,
				category: r.category,
				views: r.views,
				is_public: r.is_public,
				is_current: r.is_current,
				generated_at: r.generated_at,
				author: r.author,
				entry_count: r._count.entries,
				created_at: r.created_at,
				updated_at: r.updated_at,
			})),
			total_count: totalCount,
			page: page + 1,
			take,
		}
	}

	async getById(id: string, user_id?: number, identity: ViewIdentity = {}) {
		const num = Number(id)
		const tierList = await prisma.tierList.findFirst({
			where: isNaN(num)
				? { external_id: id }
				: { OR: [{ external_id: id }, { id: num }] },
			include: {
				author: AUTHOR_SELECT,
				entries: { orderBy: { position: 'asc' } },
			},
		})

		if (!tierList) return null
		const counted = await recordContentView('TIER_LIST', tierList.id, {
			...identity,
			userId: user_id,
		})
		if (counted) {
			await prisma.tierList.update({
				where: { id: tierList.id },
				data: { views: { increment: 1 } },
			})
			contentViewsTotal.inc({ type: 'tier_list' })
		}

		const serialized = serialize(tierList)

		let previousVersion: ReturnType<typeof serialize> | null = null
		if (tierList.kind === TierListKind.SYSTEM && tierList.category) {
			const previous = await prisma.tierList.findFirst({
				where: {
					category: tierList.category,
					kind: TierListKind.SYSTEM,
					removed_at: null,
					is_current: false,
					external_id: { not: tierList.external_id },
				},
				orderBy: { generated_at: 'desc' },
				include: {
					author: AUTHOR_SELECT,
					entries: { orderBy: { position: 'asc' } },
				},
			})
			if (previous) previousVersion = serialize(previous)
		}

		return {
			...serialized,
			views: serialized.views + (counted ? 1 : 0),
			previous_version: previousVersion,
		}
	}

	async create(
		author_id: number,
		data: {
			title: string
			description?: string
			item_kind?: string
			is_public?: boolean
			scenario?: string
			category?: string
			entries?: Array<{
				item_id: string
				rank: string
				position?: number
			}>
		}
	) {
		const tierList = await prisma.tierList.create({
			data: {
				external_id: generateSlug(data.title),
				title: data.title,
				description: data.description ?? '',
				kind: TierListKind.USER,
				item_kind:
					(data.item_kind as TierItemKind) ?? TierItemKind.WEAPON,
				is_public: data.is_public ?? true,
				scenario: data.scenario,
				category: data.category,
				author_id,
				entries: data.entries
					? {
							create: data.entries.map((e) => ({
								item_id: e.item_id,
								rank: e.rank as TierRank,
								position: e.position ?? 0,
							})),
						}
					: undefined,
			},
			include: {
				author: { select: { id: true, name: true, username: true } },
				entries: { orderBy: { position: 'asc' } },
			},
		})

		return {
			id: tierList.id,
			external_id: tierList.external_id,
			title: tierList.title,
			description: tierList.description,
			kind: tierList.kind,
			item_kind: tierList.item_kind,
			scenario: tierList.scenario,
			category: tierList.category,
			is_public: tierList.is_public,
			author: tierList.author,
			entries: tierList.entries.map((e) => ({
				id: e.id,
				item_id: e.item_id,
				rank: e.rank,
				ttk: e.ttk,
				position: e.position,
			})),
			created_at: tierList.created_at,
			updated_at: tierList.updated_at,
		}
	}

	async update(
		id: number,
		author_id: number,
		is_admin: boolean,
		data: {
			title?: string
			description?: string
			is_public?: boolean
			category?:
				| 'general'
				| 'assault_rifle'
				| 'sniper_rifle'
				| 'shotgun_rifle'
				| 'submachine_gun'
				| 'machine_gun'
				| 'pistol'
			entries?: Array<{
				item_id: string
				rank: string
				position?: number
			}>
		}
	) {
		const existing = await prisma.tierList.findUnique({ where: { id } })
		if (!existing) return null
		if (existing.author_id !== author_id && !is_admin)
			return { error: 'Forbidden' }

		const updateData: Record<string, unknown> = {}
		if (data.title !== undefined) updateData.title = data.title
		if (data.description !== undefined)
			updateData.description = data.description
		if (data.is_public !== undefined) updateData.is_public = data.is_public
		if (data.category !== undefined) updateData.category = data.category

		if (data.entries !== undefined) {
			await prisma.tierListEntry.deleteMany({
				where: { tier_list_id: id },
			})
			if (data.entries.length > 0) {
				await prisma.tierListEntry.createMany({
					data: data.entries.map((e) => ({
						tier_list_id: id,
						item_id: e.item_id,
						rank: e.rank as TierRank,
						position: e.position ?? 0,
					})),
				})
			}
		}

		const tierList = await prisma.tierList.update({
			where: { id },
			data: updateData,
			include: {
				author: { select: { id: true, name: true, username: true } },
				entries: { orderBy: { position: 'asc' } },
			},
		})

		return {
			id: tierList.id,
			external_id: tierList.external_id,
			title: tierList.title,
			description: tierList.description,
			kind: tierList.kind,
			item_kind: tierList.item_kind,
			scenario: tierList.scenario,
			category: tierList.category,
			is_public: tierList.is_public,
			author: tierList.author,
			entries: tierList.entries.map((e) => ({
				id: e.id,
				item_id: e.item_id,
				rank: e.rank,
				ttk: e.ttk,
				position: e.position,
			})),
			created_at: tierList.created_at,
			updated_at: tierList.updated_at,
		}
	}

	async delete(id: number, author_id: number, is_admin: boolean) {
		const existing = await prisma.tierList.findUnique({ where: { id } })
		if (!existing) return false
		if (existing.author_id !== author_id && !is_admin) return false
		await prisma.tierList.delete({ where: { id } })
		return true
	}
}

export const tierListsService = new TierListsService()
