import { prisma } from '@/lib/prisma'
import {
	audit,
	bump,
	getOrder,
	permissions,
	record,
	repeated,
	transaction,
} from './data'
import {
	ensure,
	futureDate,
	participant,
	refundAvailable,
	text,
} from './policy'
import type { CaseCommandInput } from './schemas'

export const arbitration = {
	async capabilities(actor: number) {
		return permissions(actor)
	},
	async list(actor: number, page: number) {
		ensure((await permissions(actor)).arbitrate, 'ARBITER_REQUIRED', 403)
		const arbiters = await prisma.user.findMany({
			where: {
				roles: {
					some: {
						permissions: { some: { name: 'commission:arbitrate' } },
					},
				},
				NOT: { user_settings: { is: { banned: true } } },
			},
			select: { id: true },
		})
		const available = arbiters.map((user) => user.id)
		const where = {
			order: { artist_id: { not: actor }, customer_id: { not: actor } },
			opened_by: { not: actor },
			OR: [
				{ assigned_to: null },
				{ assigned_to: actor },
				{ assigned_to: { notIn: available } },
			],
		}
		const [rows, total] = await Promise.all([
			prisma.commissionCase.findMany({
				where,
				select: {
					id: true,
					kind: true,
					status: true,
					assigned_to: true,
					version: true,
					created_at: true,
				},
				skip: (page - 1) * 20,
				take: 20,
				orderBy: [{ status: 'asc' }, { created_at: 'asc' }],
			}),
			prisma.commissionCase.count({ where }),
		])
		return {
			data: rows.map((entry) => ({
				...entry,
				claimable:
					entry.assigned_to === null
						? entry.status === 'OPEN'
						: !available.includes(entry.assigned_to),
			})),
			total,
			page,
		}
	},
	async detail(actor: number, id: string) {
		return transaction(async (db) => {
			const entry = await db.commissionCase.findUnique({
				where: { id },
				include: {
					decisions: { orderBy: { created_at: 'asc' } },
					review: true,
				},
			})
			ensure(entry, 'CASE_NOT_FOUND', 404)
			const order = await getOrder(db, entry.order_id)
			const isArbiter =
				(await permissions(actor, db)).arbitrate &&
				entry.assigned_to === actor &&
				!participant(order, actor)
			ensure(
				participant(order, actor) ||
					isArbiter ||
					entry.opened_by === actor,
				'CASE_NOT_FOUND',
				404
			)
			if (isArbiter) await audit(db, actor, 'commission:case:view', id)
			const { review, ...safe } = entry
			return {
				...safe,
				review: isArbiter ? review : undefined,
				currency:
					participant(order, actor) || isArbiter
						? order.currency
						: undefined,
				order_id:
					participant(order, actor) || isArbiter
						? order.id
						: undefined,
			}
		})
	},
	async command(actor: number, id: string, input: CaseCommandInput) {
		return transaction(async (db) => {
			ensure(
				(await permissions(actor, db)).arbitrate,
				'ARBITER_REQUIRED',
				403
			)
			const entry = await db.commissionCase.findUnique({ where: { id } })
			ensure(entry, 'CASE_NOT_FOUND', 404)
			const order = await getOrder(db, entry.order_id)
			ensure(
				!participant(order, actor) && entry.opened_by !== actor,
				'CONFLICT_OF_INTEREST',
				403
			)
			if (await repeated(db, order.id, actor, input.key, input))
				return { id }
			ensure(entry.version === input.version, 'STALE_CASE', 409)
			if (input.action === 'claim') {
				const previous =
					entry.assigned_to === null
						? null
						: await db.user.findUnique({
								where: { id: entry.assigned_to },
								select: {
									user_settings: { select: { banned: true } },
								},
							})
				const previousAvailable =
					entry.assigned_to !== null &&
					previous &&
					!previous.user_settings?.banned &&
					(await permissions(entry.assigned_to, db)).arbitrate
				ensure(
					entry.assigned_to === null
						? entry.status === 'OPEN'
						: !previousAvailable,
					'CASE_ASSIGNED',
					409
				)
			} else ensure(entry.assigned_to === actor, 'CASE_NOT_ASSIGNED', 403)
			await bump(db, order, order.version)
			const change = await db.commissionCase.updateMany({
				where: { id, version: input.version },
				data: {
					version: { increment: 1 },
					...(input.action === 'claim' ? { assigned_to: actor } : {}),
				},
			})
			ensure(change.count === 1, 'STALE_CASE', 409)
			let kind = `ARBITRATION_${input.action.toUpperCase()}`
			if (input.action === 'message') {
				ensure(entry.status === 'OPEN', 'CASE_CLOSED', 409)
				ensure(
					input.content.length > 0 || input.file_ids.length > 0,
					'MESSAGE_REQUIRED'
				)
			} else if (input.action === 'reopen') {
				ensure(entry.status === 'RESOLVED', 'CASE_OPEN', 409)
				ensure(
					!order.cases.some(
						(c) =>
							c.id !== id &&
							c.kind === entry.kind &&
							c.status === 'OPEN'
					),
					'DISPUTE_OPEN',
					409
				)
				await db.commissionCase.update({
					where: { id },
					data: {
						status: 'OPEN',
						reason: text(input.content, 10),
						previous_status: order.status,
					},
				})
			} else if (input.action === 'decide') {
				ensure(
					entry.status === 'OPEN' && input.outcome,
					'INVALID_DECISION',
					409
				)
				text(input.content, 10)
				text(input.obligations, 10)
				if (entry.kind === 'REVIEW') {
					ensure(
						['HIDE_REVIEW', 'KEEP_REVIEW'].includes(
							input.outcome
						) && input.refund === 0,
						'INVALID_DECISION'
					)
					await db.commissionReview.update({
						where: { id: entry.review_id! },
						data: { hidden: input.outcome === 'HIDE_REVIEW' },
					})
				} else {
					ensure(
						['RESUME', 'COMPLETE', 'CANCEL'].includes(
							input.outcome
						),
						'INVALID_DECISION'
					)
					ensure(
						input.refund <=
							refundAvailable(order.payments, order.refunds),
						'REFUND_EXCEEDS_PAYMENT'
					)
					await db.commissionOrder.update({
						where: { id: order.id },
						data: {
							status:
								input.outcome === 'RESUME'
									? 'IN_PROGRESS'
									: input.outcome === 'COMPLETE'
										? 'COMPLETED'
										: 'CANCELLED',
							cancellation_by: null,
							...(input.outcome === 'RESUME'
								? { due_at: futureDate(input.due_at ?? '') }
								: {}),
						},
					})
				}
				const decision = await db.commissionDecision.create({
					data: {
						case_id: id,
						arbiter_id: actor,
						outcome: input.outcome,
						reason: input.content,
						obligations: input.obligations,
					},
				})
				if (input.refund > 0)
					await db.commissionRefund.create({
						data: {
							order_id: order.id,
							decision_id: decision.id,
							amount: input.refund,
							due_at: futureDate(input.due_at ?? ''),
						},
					})
				await db.commissionCase.update({
					where: { id },
					data: { status: 'RESOLVED' },
				})
				kind = `ARBITRATION_${input.outcome}`
			}
			await record(
				db,
				order,
				actor,
				input.key,
				kind,
				input.content,
				input,
				input.file_ids
			)
			await audit(db, actor, `commission:case:${input.action}`, id)
			return { id }
		})
	},
	async reputation(actor: number, customer: number, page: number) {
		ensure(Number.isSafeInteger(customer) && customer > 0, 'INVALID_INPUT')
		const p = await permissions(actor)
		ensure(p.author && actor !== customer, 'AUTHOR_REQUIRED', 403)
		const where = { customer_id: customer, hidden: false }
		const [aggregate, reviews] = await Promise.all([
			prisma.commissionReview.aggregate({
				where,
				_avg: { score: true },
				_count: { _all: true },
			}),
			prisma.commissionReview.findMany({
				where,
				select: {
					id: true,
					order_id: true,
					score: true,
					content: true,
					created_at: true,
					artist_id: true,
				},
				orderBy: { created_at: 'desc' },
				take: 20,
				skip: (page - 1) * 20,
			}),
		])
		return {
			average: aggregate._avg.score,
			total: aggregate._count._all,
			data: reviews,
			page,
		}
	},
}
