import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
	type GlobalNotificationPart,
	type GlobalNotificationTypeValue,
	validateGlobalNotificationDateRange,
} from './global-notifications.validation'

export interface GlobalNotificationSaveInput {
	title: string
	type: GlobalNotificationTypeValue
	content: GlobalNotificationPart[]
	is_active: boolean
	starts_at: Date
	expires_at: Date | null
}

export type GlobalNotificationUpdateInput = Partial<GlobalNotificationSaveInput>

function dtoType(type: string) {
	return type.toLowerCase() as 'info' | 'warning' | 'danger'
}

export function publicGlobalNotificationWhere(now: Date) {
	return {
		is_active: true,
		starts_at: { lte: now },
		OR: [{ expires_at: null }, { expires_at: { gt: now } }],
	}
}

export function toGlobalNotificationDto(notification: {
	id: number
	title: string
	type: string
	content: unknown
	is_active: boolean
	starts_at: Date
	expires_at: Date | null
	author_id: number | null
	created_at: Date
	updated_at: Date
}) {
	return {
		id: notification.id,
		title: notification.title,
		type: dtoType(notification.type),
		content: notification.content,
		is_active: notification.is_active,
		starts_at: notification.starts_at,
		expires_at: notification.expires_at,
		author_id: notification.author_id,
		created_at: notification.created_at,
		updated_at: notification.updated_at,
	}
}

export function toGlobalNotificationListDto(
	notifications: Parameters<typeof toGlobalNotificationDto>[0][]
) {
	return { data: notifications.map(toGlobalNotificationDto) }
}

class GlobalNotificationService {
	async listPublic(now = new Date()) {
		const notifications = await prisma.globalNotification.findMany({
			where: publicGlobalNotificationWhere(now),
			orderBy: { created_at: 'desc' },
		})
		return toGlobalNotificationListDto(notifications)
	}

	async listAdmin() {
		const notifications = await prisma.globalNotification.findMany({
			orderBy: { created_at: 'desc' },
		})
		return notifications.map(toGlobalNotificationDto)
	}

	async get(id: number) {
		const notification = await prisma.globalNotification.findUnique({
			where: { id },
		})
		return notification ? toGlobalNotificationDto(notification) : null
	}

	async create(input: GlobalNotificationSaveInput, author_id: number) {
		if (
			!validateGlobalNotificationDateRange(
				input.starts_at,
				input.expires_at
			)
		) {
			throw new Error(
				'expires_at must be greater than or equal to starts_at'
			)
		}

		const notification = await prisma.globalNotification.create({
			data: {
				title: input.title,
				type: input.type,
				content: input.content as Prisma.InputJsonValue,
				is_active: input.is_active,
				starts_at: input.starts_at,
				expires_at: input.expires_at,
				author_id,
			},
		})
		return toGlobalNotificationDto(notification)
	}

	async update(id: number, input: GlobalNotificationUpdateInput) {
		const existing = await prisma.globalNotification.findUnique({
			where: { id },
		})
		if (!existing) return null

		const starts_at = input.starts_at ?? existing.starts_at
		const expires_at =
			input.expires_at === undefined
				? existing.expires_at
				: input.expires_at
		if (!validateGlobalNotificationDateRange(starts_at, expires_at)) {
			throw new Error(
				'expires_at must be greater than or equal to starts_at'
			)
		}

		const notification = await prisma.globalNotification.update({
			where: { id },
			data: {
				...(input.title !== undefined && { title: input.title }),
				...(input.type !== undefined && { type: input.type }),
				...(input.content !== undefined && {
					content: input.content as Prisma.InputJsonValue,
				}),
				...(input.is_active !== undefined && {
					is_active: input.is_active,
				}),
				...(input.starts_at !== undefined && {
					starts_at: input.starts_at,
				}),
				...(input.expires_at !== undefined && {
					expires_at: input.expires_at,
				}),
			},
		})
		return toGlobalNotificationDto(notification)
	}

	async remove(id: number) {
		const existing = await prisma.globalNotification.findUnique({
			where: { id },
			select: { id: true },
		})
		if (!existing) return false
		await prisma.globalNotification.delete({ where: { id } })
		return true
	}
}

export const globalNotificationService = new GlobalNotificationService()
