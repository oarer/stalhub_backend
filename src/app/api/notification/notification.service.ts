import type { NotificationType } from 'generated/prisma/enums'
import { prisma } from '@/lib/prisma'

type CreateNotificationDTO = {
	type?: NotificationType
	content: string
	expiresAt?: Date
}

type UpdateNotificationDTO = {
	type?: NotificationType
	content?: string
	expiresAt?: Date | null
}

class NotificationService {
	async list() {
		return prisma.notification.findMany({
			orderBy: { createdAt: 'desc' },
		})
	}

	async get(id: number) {
		return prisma.notification.findUnique({
			where: { id },
		})
	}

	async create(data: CreateNotificationDTO) {
		return prisma.notification.create({
			data: {
				type: data.type ?? 'INFO',
				content: data.content,
				expiresAt: data.expiresAt,
			},
		})
	}

	async update(id: number, data: UpdateNotificationDTO) {
		return prisma.notification.update({
			where: { id },
			data,
		})
	}

	async delete(id: number) {
		await prisma.notification.delete({
			where: { id },
		})
	}
}

export const notificationService = new NotificationService()
