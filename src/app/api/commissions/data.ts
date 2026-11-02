import { createHash } from 'node:crypto'
import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { ensure, participant } from './policy'

export type Tx = Prisma.TransactionClient
export const person = { id: true, username: true, name: true } as const
export const orderInclude = {
	customer: { select: person },
	artist: { select: person },
	payments: { orderBy: [{ upfront: 'desc' }, { id: 'asc' }] },
	refunds: { orderBy: { id: 'asc' } },
	cases: {
		include: { decisions: { orderBy: { created_at: 'asc' as const } } },
		orderBy: { created_at: 'desc' as const },
	},
} satisfies Prisma.CommissionOrderInclude
export type Order = Prisma.CommissionOrderGetPayload<{
	include: typeof orderInclude
}>
export const fingerprint = (value: unknown) =>
	createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await prisma.$transaction(run, {
				isolationLevel: 'Serializable',
				timeout: 15000,
			})
		} catch (error) {
			if (
				attempt < 3 &&
				['P2034', 'P2002'].includes(
					(error as { code?: string }).code ?? ''
				)
			)
				continue
			throw error
		}
	}
}

export async function permissions(userId: number, db: Tx = prisma) {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: {
			roles: {
				select: { name: true, permissions: { select: { name: true } } },
			},
		},
	})
	return {
		author: user?.roles.some((r) => r.name === 'author') ?? false,
		arbitrate:
			user?.roles.some((r) =>
				r.permissions.some((p) => p.name === 'commission:arbitrate')
			) ?? false,
	}
}

export async function getOrder(db: Tx, id: string) {
	const order = await db.commissionOrder.findUnique({
		where: { id },
		include: orderInclude,
	})
	ensure(order, 'ORDER_NOT_FOUND', 404)
	return order
}

export function activeDispute(order: Order) {
	return order.cases.some((c) => c.kind === 'ORDER' && c.status === 'OPEN')
}

export async function access(db: Tx, order: Order, userId: number) {
	if (participant(order, userId)) return
	const p = await permissions(userId, db)
	ensure(
		p.arbitrate && order.cases.some((c) => c.assigned_to === userId),
		'ORDER_NOT_FOUND',
		404
	)
	await audit(db, userId, 'commission:materials:view', order.id)
}

export async function bump(db: Tx, order: Order, version: number) {
	ensure(order.version === version, 'STALE_ORDER', 409)
	const result = await db.commissionOrder.updateMany({
		where: { id: order.id, version },
		data: { version: { increment: 1 } },
	})
	ensure(result.count === 1, 'STALE_ORDER', 409)
}

export async function audit(
	db: Tx,
	actor: number,
	action: string,
	entityId: string
) {
	await db.adminAuditLog.create({
		data: {
			actor_id: actor,
			action,
			entity: 'commission',
			entity_id: entityId,
		},
	})
}

export async function attach(
	db: Tx,
	ids: string[],
	userId: number,
	orderId: string,
	messageId?: number
) {
	ensure(new Set(ids).size === ids.length, 'DUPLICATE_FILES')
	if (!ids.length) return
	const files = await db.commissionFile.findMany({
		where: {
			id: { in: ids },
			owner_id: userId,
			order_id: null,
			message_id: null,
		},
	})
	ensure(files.length === ids.length, 'INVALID_FILES')
	await db.commissionFile.updateMany({
		where: {
			id: { in: ids },
			owner_id: userId,
			order_id: null,
			message_id: null,
		},
		data: { order_id: orderId, message_id: messageId },
	})
}

export async function notify(
	db: Tx,
	order: Order,
	actor: number,
	event: string,
	chat = false
) {
	for (const recipient of [order.customer_id, order.artist_id].filter(
		(id) => id !== actor
	)) {
		const field =
			recipient === order.customer_id
				? 'customer_notification_id'
				: 'artist_notification_id'
		if (chat && order[field]) {
			const existing = await db.notifications.findFirst({
				where: {
					id: order[field]!,
					read: false,
					users: { some: { id: recipient } },
				},
			})
			if (existing) continue
		}
		const notification = await db.notifications.create({
			data: {
				title: 'Заказ художнику',
				content: `${order.title}: ${event}`,
				author: 'Система',
				link: `/me/commissions/${order.id}`,
				users: { connect: { id: recipient } },
			},
		})
		if (chat)
			await db.commissionOrder.update({
				where: { id: order.id },
				data: { [field]: notification.id },
			})
	}
}

export async function record(
	db: Tx,
	order: Order,
	actor: number,
	key: string,
	kind: string,
	content: string,
	input: unknown,
	files: string[] = []
) {
	const privateReview = kind === 'REVIEW'
	const message = await db.commissionMessage.create({
		data: {
			order_id: order.id,
			author_id: actor,
			key,
			kind,
			content: privateReview ? '' : content,
			data: {
				request_hash: fingerprint(input),
				...(privateReview
					? { private_review: input as Prisma.InputJsonValue }
					: {}),
			},
		},
	})
	await attach(db, files, actor, order.id, message.id)
	await notify(
		db,
		order,
		actor,
		kind === 'CHAT' ? 'новое сообщение' : kind,
		kind === 'CHAT'
	)
	return message
}

export async function repeated(
	db: Tx,
	orderId: string,
	actor: number,
	key: string,
	input: unknown
) {
	const message = await db.commissionMessage.findUnique({
		where: {
			order_id_author_id_key: {
				order_id: orderId,
				author_id: actor,
				key,
			},
		},
	})
	if (!message) return false
	ensure(
		(message.data as { request_hash?: string } | null)?.request_hash ===
			fingerprint(input),
		'KEY_ALREADY_USED',
		409
	)
	return true
}
