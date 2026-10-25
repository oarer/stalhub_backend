import { prisma } from '@/lib/prisma'

export type NotificationTarget = {
	kind: 'all' | 'role' | 'clan' | 'banned'
	role_id?: number
	clan_id?: string
}

export interface NotificationPayload {
	title: string
	content: string
	type?: number
	link?: string
}

async function resolveTargetUserIds(
	target: NotificationTarget
): Promise<number[]> {
	switch (target.kind) {
		case 'all':
			return (await prisma.user.findMany({ select: { id: true } })).map(
				(u) => u.id
			)
		case 'role':
			if (!target.role_id) return []
			return (
				await prisma.user.findMany({
					where: { roles: { some: { id: target.role_id } } },
					select: { id: true },
				})
			).map((u) => u.id)
		case 'clan': {
			if (!target.clan_id) return []
			return (
				await prisma.clanMember.findMany({
					where: { clan_id: target.clan_id },
					select: { user_id: true },
				})
			)
				.map((m) => m.user_id)
				.filter((id): id is number => id !== null)
		}
		case 'banned':
			return (
				await prisma.user.findMany({
					where: { user_settings: { banned: true } },
					select: { id: true },
				})
			).map((u) => u.id)
		default:
			return []
	}
}

class AdminNotificationService {
	async post(payload: NotificationPayload, user_ids: number[]) {
		if (user_ids.length === 0) {
			return { sent: 0, notification: null }
		}

		const notification = await prisma.notifications.create({
			data: {
				title: payload.title,
				content: payload.content,
				type: payload.type ?? 0,
				link: payload.link ?? null,
				author: 'Администрация',
				users: {
					connect: user_ids.map((id) => ({ id })),
				},
			},
		})

		return { sent: user_ids.length, notification }
	}

	async sendToTarget(
		payload: NotificationPayload,
		target: NotificationTarget
	) {
		const ids = await resolveTargetUserIds(target)
		return this.post(payload, ids)
	}

	async countTarget(target: NotificationTarget) {
		return (await resolveTargetUserIds(target)).length
	}

	async sendToAll(data: NotificationPayload) {
		const users = await prisma.user.findMany({ select: { id: true } })

		if (users.length === 0) return { sent: 0 }

		const notification = await prisma.notifications.create({
			data: {
				title: data.title,
				content: data.content,
				type: data.type ?? 0,
				link: data.link ?? null,
				author: 'Администрация',
				users: { connect: users.map((u) => ({ id: u.id })) },
			},
		})

		return { sent: users.length, notification }
	}

	async sendToUser(user_id: number, data: NotificationPayload) {
		const user = await prisma.user.findUnique({ where: { id: user_id } })
		if (!user) return null

		const notification = await prisma.notifications.create({
			data: {
				title: data.title,
				content: data.content,
				type: data.type ?? 0,
				link: data.link ?? null,
				author: 'Администрация',
				users: { connect: [{ id: user_id }] },
			},
		})

		return { sent: 1, notification }
	}

	async sendToUsers(user_ids: number[], data: NotificationPayload) {
		const notification = await prisma.notifications.create({
			data: {
				title: data.title,
				content: data.content,
				type: data.type ?? 0,
				link: data.link ?? null,
				author: 'Администрация',
				users: { connect: user_ids.map((id) => ({ id })) },
			},
		})

		return { sent: user_ids.length, notification }
	}

	async stats() {
		const [total, read, assigned_users, recent_sent] = await Promise.all([
			prisma.notifications.count(),
			prisma.notifications.count({ where: { read: true } }),
			prisma.user.count({ where: { notifications: { some: {} } } }),
			prisma.notifications.count({
				where: {
					created_at: { gte: new Date(Date.now() - 7 * 86_400_000) },
				},
			}),
		])

		return {
			total,
			read,
			unread: total - read,
			assigned_users,
			recent_sent_7d: recent_sent,
		}
	}
}

export const adminNotificationService = new AdminNotificationService()
