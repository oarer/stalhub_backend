import { prisma } from '@/lib/prisma'

class AdminNotificationService {
	async sendToAll(data: {
		title: string
		content: string
		type?: number
		link?: string
	}) {
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

	async sendToUser(
		user_id: number,
		data: {
			title: string
			content: string
			type?: number
			link?: string
		}
	) {
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

	async sendToUsers(
		user_ids: number[],
		data: {
			title: string
			content: string
			type?: number
			link?: string
		}
	) {
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
}

export const adminNotificationService = new AdminNotificationService()
