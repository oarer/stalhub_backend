import { prisma } from '@/lib/prisma'
import {
	access,
	activeDispute,
	attach,
	bump,
	getOrder,
	orderInclude,
	permissions,
	person,
	record,
	repeated,
	transaction,
} from './data'
import {
	canRate,
	ensure,
	futureDate,
	participant,
	paymentPlan,
	priceTotal,
	terminal,
	text,
} from './policy'
import type { CommandInput, CreateInput } from './schemas'

export const orders = {
	async create(actor: number, input: CreateInput) {
		return transaction(async (db) => {
			const existing = await db.commissionOrder.findUnique({
				where: {
					customer_id_request_key: {
						customer_id: actor,
						request_key: input.key,
					},
				},
			})
			if (existing) {
				ensure(
					await repeated(db, existing.id, actor, input.key, input),
					'KEY_ALREADY_USED',
					409
				)
				return { id: existing.id }
			}
			ensure(actor !== input.artist_id, 'SELF_ORDER')
			const profile = await db.artistProfile.findUnique({
				where: { user_id: input.artist_id },
				include: {
					prices: { where: { archived: false } },
					user: { select: { user_settings: true } },
				},
			})
			ensure(
				profile?.accepting &&
					!profile.user.user_settings?.banned &&
					(await permissions(input.artist_id, db)).author,
				'ARTIST_UNAVAILABLE',
				409
			)
			ensure(
				profile.version === input.profile_version,
				'PRICE_CHANGED',
				409
			)
			ensure(
				new Set(input.price_ids).size === input.price_ids.length,
				'DUPLICATE_PRICES'
			)
			const items = input.price_ids.map((id) => {
				const price = profile.prices.find((p) => p.id === id)
				ensure(price, 'PRICE_CHANGED', 409)
				return {
					id: price.id,
					title: price.title,
					description: price.description,
					amount: price.amount,
					days_min: price.days_min,
					days_max: price.days_max,
				}
			})
			const order = await db.commissionOrder.create({
				data: {
					customer_id: actor,
					artist_id: input.artist_id,
					request_key: input.key,
					title: input.title,
					brief: input.brief,
					items,
					terms: profile.terms,
					currency: profile.currency,
					total: priceTotal(items),
					revisions: profile.revisions,
				},
				include: orderInclude,
			})
			await attach(db, input.file_ids, actor, order.id)
			await record(db, order, actor, input.key, 'CREATED', '', input)
			return { id: order.id }
		})
	},
	async list(actor: number, side: string, page: number, status?: string) {
		const where = {
			...(side === 'artist'
				? { artist_id: actor }
				: { customer_id: actor }),
			...(status ? { status } : {}),
		}
		const [rows, total] = await Promise.all([
			prisma.commissionOrder.findMany({
				where,
				orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
				skip: (page - 1) * 20,
				take: 20,
				select: {
					id: true,
					title: true,
					status: true,
					total: true,
					currency: true,
					updated_at: true,
					customer: { select: person },
					artist: { select: person },
					customer_read: true,
					artist_read: true,
					messages: {
						orderBy: { id: 'desc' },
						take: 1,
						select: { id: true, author_id: true },
					},
				},
			}),
			prisma.commissionOrder.count({ where }),
		])
		const unreadOrders = rows.length
			? await prisma.commissionMessage.groupBy({
					by: ['order_id'],
					where: {
						author_id: { not: actor },
						OR: rows.map((row) => ({
							order_id: row.id,
							id: {
								gt:
									row.customer.id === actor
										? row.customer_read
										: row.artist_read,
							},
						})),
					},
				})
			: []
		const unread = new Set(unreadOrders.map((row) => row.order_id))
		return {
			data: rows.map(
				({
					messages: _messages,
					customer_read: _customerRead,
					artist_read: _artistRead,
					...row
				}) => ({ ...row, unread: unread.has(row.id) })
			),
			total,
			page,
		}
	},
	async detail(actor: number, id: string) {
		const order = await getOrder(prisma, id)
		await access(prisma, order, actor)
		const files = await prisma.commissionFile.findMany({
			where: { order_id: id, message_id: null },
			select: { id: true, name: true, mime: true, size: true },
		})
		return { ...order, files }
	},
	async messages(actor: number, id: string, after: number, before: number) {
		await access(prisma, await getOrder(prisma, id), actor)
		const data = await prisma.commissionMessage.findMany({
			where: {
				order_id: id,
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
				files: {
					select: { id: true, name: true, mime: true, size: true },
				},
			},
		})
		return {
			data: after ? data : data.reverse(),
			has_more: data.length === 50,
		}
	},
	async read(actor: number, id: string, through: number) {
		return transaction(async (db) => {
			const order = await getOrder(db, id)
			ensure(participant(order, actor), 'ORDER_NOT_FOUND', 404)
			const last = await db.commissionMessage.findFirst({
				where: { order_id: id, id: through },
			})
			ensure(last, 'INVALID_CURSOR')
			const field =
				actor === order.customer_id ? 'customer_read' : 'artist_read'
			await db.commissionOrder.updateMany({
				where: { id, [field]: { lt: through } },
				data: { [field]: through, updated_at: order.updated_at },
			})
			const notification =
				actor === order.customer_id
					? order.customer_notification_id
					: order.artist_notification_id
			const latest = await db.commissionMessage.findFirst({
				where: { order_id: id },
				orderBy: { id: 'desc' },
			})
			if (notification && latest && through >= latest.id)
				await db.notifications.updateMany({
					where: { id: notification, users: { some: { id: actor } } },
					data: { read: true },
				})
			return { ok: true }
		})
	},
	async command(actor: number, id: string, input: CommandInput) {
		return transaction(async (db) => {
			const order = await getOrder(db, id)
			const artist = order.artist_id === actor
			const customer = order.customer_id === actor
			const reporting = input.action === 'review_report'
			if (reporting && !participant(order, actor))
				ensure((await permissions(actor, db)).author, 'FORBIDDEN', 403)
			else ensure(participant(order, actor), 'ORDER_NOT_FOUND', 404)
			if (await repeated(db, id, actor, input.key, input)) return { id }
			const dispute = activeDispute(order)
			if (reporting && !participant(order, actor)) {
				ensure(
					await db.commissionReview.findFirst({
						where: { order_id: id, hidden: false },
					}),
					'REVIEW_NOT_FOUND',
					404
				)
			} else await bump(db, order, input.version)
			const duringDispute = [
				'message',
				'payment_sent',
				'payment_received',
				'payment_reject',
				'refund_sent',
				'refund_received',
				'refund_contest',
				'review_report',
			]
			ensure(
				!dispute || duringDispute.includes(input.action),
				'DISPUTE_OPEN',
				409
			)
			const { action, content, file_ids } = input
			let kind: string = action.toUpperCase()
			switch (action) {
				case 'accept': {
					ensure(
						artist && order.status === 'PENDING',
						'INVALID_TRANSITION',
						409
					)
					ensure(
						input.payments && input.due_at,
						'PAYMENT_AND_DATE_REQUIRED'
					)
					paymentPlan(order.total, input.payments)
					await db.commissionPayment.createMany({
						data: input.payments.map((p) => ({
							...p,
							order_id: id,
						})),
					})
					await db.commissionOrder.update({
						where: { id },
						data: {
							status: 'ACCEPTED',
							accepted_at: new Date(),
							due_at: futureDate(input.due_at),
						},
					})
					break
				}
				case 'decline':
					ensure(
						artist && order.status === 'PENDING',
						'INVALID_TRANSITION',
						409
					)
					text(content)
					await db.commissionOrder.update({
						where: { id },
						data: { status: 'DECLINED' },
					})
					break
				case 'cancel':
					ensure(
						!terminal.has(order.status),
						'INVALID_TRANSITION',
						409
					)
					text(content)
					if (order.status === 'PENDING') {
						ensure(customer, 'CUSTOMER_REQUIRED', 403)
						await db.commissionOrder.update({
							where: { id },
							data: { status: 'CANCELLED' },
						})
					} else {
						ensure(
							!order.cancellation_by,
							'CANCELLATION_PENDING',
							409
						)
						await db.commissionOrder.update({
							where: { id },
							data: { cancellation_by: actor },
						})
					}
					break
				case 'cancel_confirm':
				case 'cancel_reject':
					ensure(
						order.cancellation_by &&
							order.cancellation_by !== actor &&
							!terminal.has(order.status),
						'INVALID_TRANSITION',
						409
					)
					await db.commissionOrder.update({
						where: { id },
						data: {
							cancellation_by: null,
							...(action === 'cancel_confirm'
								? { status: 'CANCELLED' }
								: {}),
						},
					})
					break
				case 'start':
					ensure(
						artist &&
							order.status === 'ACCEPTED' &&
							order.payments
								.filter((p) => p.upfront)
								.every((p) => p.status === 'RECEIVED'),
						'PREPAYMENT_REQUIRED',
						409
					)
					await db.commissionOrder.update({
						where: { id },
						data: { status: 'IN_PROGRESS' },
					})
					break
				case 'deliver':
					ensure(
						artist && order.status === 'IN_PROGRESS',
						'INVALID_TRANSITION',
						409
					)
					ensure(
						content.length > 0 || file_ids.length > 0,
						'RESULT_REQUIRED'
					)
					await db.commissionOrder.update({
						where: { id },
						data: { status: 'REVIEW' },
					})
					break
				case 'revise':
					ensure(
						customer && order.status === 'REVIEW',
						'INVALID_TRANSITION',
						409
					)
					ensure(
						order.revisions_used < order.revisions,
						'REVISIONS_EXHAUSTED',
						409
					)
					text(content)
					await db.commissionOrder.update({
						where: { id },
						data: {
							status: 'IN_PROGRESS',
							revisions_used: { increment: 1 },
						},
					})
					break
				case 'approve':
					ensure(
						customer &&
							order.status === 'REVIEW' &&
							order.payments.every(
								(p) => p.status === 'RECEIVED'
							),
						'PAYMENT_REQUIRED',
						409
					)
					await db.commissionOrder.update({
						where: { id },
						data: { status: 'COMPLETED', cancellation_by: null },
					})
					break
				case 'payment_sent':
				case 'payment_received':
				case 'payment_reject': {
					ensure(
						order.accepted_at &&
							!['DECLINED', 'CANCELLED'].includes(order.status),
						'INVALID_TRANSITION',
						409
					)
					const payment = order.payments.find(
						(p) => p.id === input.target_id
					)
					ensure(
						payment && payment.status !== 'RECEIVED',
						'INVALID_PAYMENT',
						409
					)
					if (action === 'payment_sent')
						ensure(
							customer && payment.status === 'EXPECTED',
							'INVALID_PAYMENT',
							409
						)
					else ensure(artist, 'ARTIST_REQUIRED', 403)
					if (action === 'payment_reject') {
						ensure(
							payment.status === 'SENT',
							'INVALID_PAYMENT',
							409
						)
						text(content)
					}
					await db.commissionPayment.update({
						where: { id: payment.id },
						data: {
							status:
								action === 'payment_sent'
									? 'SENT'
									: action === 'payment_received'
										? 'RECEIVED'
										: 'EXPECTED',
							note: content,
							...(action === 'payment_sent'
								? { sent_at: new Date() }
								: action === 'payment_received'
									? { received_at: new Date() }
									: {}),
						},
					})
					break
				}
				case 'message':
					ensure(
						content.length > 0 || file_ids.length > 0,
						'MESSAGE_REQUIRED'
					)
					kind = 'CHAT'
					break
				case 'dispute':
					ensure(
						order.accepted_at &&
							!order.cases.some((c) => c.kind === 'ORDER'),
						'DISPUTE_EXISTS',
						409
					)
					await db.commissionCase.create({
						data: {
							order_id: id,
							opened_by: actor,
							reason: text(content, 10),
							previous_status: order.status,
						},
					})
					break
				case 'review': {
					ensure(
						canRate(order, actor, dispute) &&
							(await permissions(actor, db)).author,
						'CANNOT_RATE',
						403
					)
					ensure(input.score, 'SCORE_REQUIRED')
					ensure(file_ids.length === 0, 'REVIEW_FILES_NOT_ALLOWED')
					const old = await db.commissionReview.findUnique({
						where: { order_id: id },
						include: { cases: true },
					})
					ensure(
						!old?.hidden && !old?.cases.length,
						'REVIEW_LOCKED',
						409
					)
					await db.commissionReview.upsert({
						where: { order_id: id },
						create: {
							order_id: id,
							customer_id: order.customer_id,
							artist_id: actor,
							score: input.score,
							content: text(content, 1, 2000),
						},
						update: {
							score: input.score,
							content: text(content, 1, 2000),
						},
					})
					break
				}
				case 'review_report': {
					const review = await db.commissionReview.findUnique({
						where: { order_id: id },
					})
					ensure(
						review && actor !== review.artist_id,
						'CANNOT_REPORT',
						403
					)
					ensure(
						!(await db.commissionCase.findFirst({
							where: { review_id: review.id, status: 'OPEN' },
						})),
						'REPORT_EXISTS',
						409
					)
					await db.commissionCase.create({
						data: {
							order_id: id,
							review_id: review.id,
							kind: 'REVIEW',
							opened_by: actor,
							reason: text(content, 10),
							previous_status: order.status,
						},
					})
					break
				}
				case 'refund_sent':
				case 'refund_received':
				case 'refund_contest': {
					const refund = order.refunds.find(
						(r) => r.id === input.target_id
					)
					ensure(
						refund && refund.status !== 'RECEIVED',
						'INVALID_REFUND',
						409
					)
					if (action === 'refund_sent')
						ensure(
							artist &&
								['EXPECTED', 'CONTESTED'].includes(
									refund.status
								) &&
								file_ids.length > 0,
							'REFUND_EVIDENCE_REQUIRED'
						)
					else
						ensure(
							customer && refund.status === 'SENT',
							'INVALID_REFUND',
							409
						)
					if (action === 'refund_contest') text(content, 10)
					await db.commissionRefund.update({
						where: { id: refund.id },
						data: {
							status:
								action === 'refund_sent'
									? 'SENT'
									: action === 'refund_received'
										? 'RECEIVED'
										: 'CONTESTED',
							note: content,
							...(action === 'refund_sent'
								? { sent_at: new Date() }
								: action === 'refund_received'
									? { received_at: new Date() }
									: {}),
						},
					})
					if (action === 'refund_contest') {
						const decision =
							await db.commissionDecision.findUniqueOrThrow({
								where: { id: refund.decision_id },
							})
						await db.commissionCase.update({
							where: { id: decision.case_id },
							data: {
								status: 'OPEN',
								version: { increment: 1 },
								reason: content,
							},
						})
					}
					break
				}
			}
			const event = await record(
				db,
				order,
				actor,
				input.key,
				kind,
				content,
				input,
				file_ids
			)
			if (action === 'deliver')
				await db.commissionOrder.update({
					where: { id },
					data: { result_message_id: event.id },
				})
			return { id }
		})
	},
}
