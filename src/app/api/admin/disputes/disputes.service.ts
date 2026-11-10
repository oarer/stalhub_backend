import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { orderInclude, person } from '../../commissions/data'
import { files } from '../../commissions/files'
import { ensure } from '../../commissions/policy'

type DisputeListQuery = {
	take: number
	page: number
	status?: string
	kind?: string
	assigned?: 'all' | 'unassigned' | 'me'
	search?: string
	actor: number
}

const fileSelection = {
	id: true,
	name: true,
	mime: true,
	size: true,
} as const

type Person = {
	id: number
	username: string
	name: string | null
}

async function people(ids: number[]) {
	const unique = [...new Set(ids)]
	if (!unique.length) return new Map<number, Person>()
	const rows = await prisma.user.findMany({
		where: { id: { in: unique } },
		select: person,
	})
	return new Map<number, Person>(rows.map((row) => [row.id, row]))
}

export async function listDisputes({
	take,
	page,
	status,
	kind,
	assigned,
	search,
	actor,
}: DisputeListQuery) {
	const where: Prisma.CommissionCaseWhereInput = {}
	if (status) where.status = status
	if (kind) where.kind = kind
	if (assigned === 'unassigned') where.assigned_to = null
	if (assigned === 'me') where.assigned_to = actor
	if (search) {
		where.OR = [
			{ id: { contains: search, mode: 'insensitive' } },
			{ reason: { contains: search, mode: 'insensitive' } },
			{
				order: {
					title: { contains: search, mode: 'insensitive' },
				},
			},
			{
				order: {
					customer: {
						username: { contains: search, mode: 'insensitive' },
					},
				},
			},
			{
				order: {
					artist: {
						username: { contains: search, mode: 'insensitive' },
					},
				},
			},
		]
	}

	const [rows, totalCount] = await Promise.all([
		prisma.commissionCase.findMany({
			where,
			skip: page * take,
			take,
			orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
			select: {
				id: true,
				order_id: true,
				kind: true,
				status: true,
				reason: true,
				opened_by: true,
				assigned_to: true,
				version: true,
				created_at: true,
				updated_at: true,
				order: {
					select: {
						id: true,
						title: true,
						status: true,
						currency: true,
						total: true,
						customer: { select: person },
						artist: { select: person },
					},
				},
			},
		}),
		prisma.commissionCase.count({ where }),
	])

	const users = await people(
		rows.flatMap((row) =>
			row.assigned_to === null
				? [row.opened_by]
				: [row.opened_by, row.assigned_to]
		)
	)

	return {
		data: rows.map((row) => ({
			...row,
			opened_by_user: users.get(row.opened_by) ?? null,
			assigned_to_user:
				row.assigned_to === null
					? null
					: (users.get(row.assigned_to) ?? null),
		})),
		total_count: totalCount,
		page: page + 1,
		take,
	}
}

export async function disputeStats(actor: number) {
	const [total, open, resolved, order, review, unassigned, assignedToMe] =
		await Promise.all([
			prisma.commissionCase.count(),
			prisma.commissionCase.count({ where: { status: 'OPEN' } }),
			prisma.commissionCase.count({ where: { status: 'RESOLVED' } }),
			prisma.commissionCase.count({ where: { kind: 'ORDER' } }),
			prisma.commissionCase.count({ where: { kind: 'REVIEW' } }),
			prisma.commissionCase.count({ where: { assigned_to: null } }),
			prisma.commissionCase.count({ where: { assigned_to: actor } }),
		])

	return {
		total,
		open,
		resolved,
		order,
		review,
		unassigned,
		assigned_to_me: assignedToMe,
	}
}

export async function getDispute(id: string) {
	const entry = await prisma.commissionCase.findUnique({
		where: { id },
		include: {
			decisions: { orderBy: { created_at: 'asc' } },
			review: true,
		},
	})
	ensure(entry, 'CASE_NOT_FOUND', 404)

	const [order, orderFiles, users] = await Promise.all([
		prisma.commissionOrder.findUnique({
			where: { id: entry.order_id },
			include: orderInclude,
		}),
		prisma.commissionFile.findMany({
			where: { order_id: entry.order_id, message_id: null },
			select: fileSelection,
		}),
		people(
			entry.assigned_to === null
				? [entry.opened_by]
				: [entry.opened_by, entry.assigned_to]
		),
	])
	ensure(order, 'ORDER_NOT_FOUND', 404)

	return {
		...entry,
		opened_by_user: users.get(entry.opened_by) ?? null,
		assigned_to_user:
			entry.assigned_to === null
				? null
				: (users.get(entry.assigned_to) ?? null),
		order: { ...order, files: orderFiles },
	}
}

export async function disputeMessages(
	id: string,
	after: number,
	before: number
) {
	const entry = await prisma.commissionCase.findUnique({
		where: { id },
		select: { order_id: true },
	})
	ensure(entry, 'CASE_NOT_FOUND', 404)

	const data = await prisma.commissionMessage.findMany({
		where: {
			order_id: entry.order_id,
			...(after
				? { id: { gt: after } }
				: before
					? { id: { lt: before } }
					: {}),
		},
		orderBy: { id: after ? 'asc' : 'desc' },
		take: 50,
		select: {
			id: true,
			author: { select: person },
			kind: true,
			content: true,
			created_at: true,
			files: { select: fileSelection },
		},
	})

	return {
		data: after ? data : data.reverse(),
		has_more: data.length === 50,
	}
}

export async function disputeFile(id: string, fileId: string) {
	const entry = await prisma.commissionCase.findUnique({
		where: { id },
		select: { order_id: true },
	})
	ensure(entry, 'CASE_NOT_FOUND', 404)

	const file = await prisma.commissionFile.findUnique({
		where: { id: fileId },
		select: { order_id: true },
	})
	ensure(file?.order_id === entry.order_id, 'FILE_NOT_FOUND', 404)

	return files.adminDownload(fileId)
}
