import { createElysia } from '@/utils/elysia'
import { globalNotificationService } from './global-notifications.service'

export const globalNotificationsRoutes = createElysia().get(
	'/global-notifications',
	{
		detail: {
			tags: ['Global notifications'],
			summary: 'List active global notifications',
		},
	},
	() => globalNotificationService.listPublic()
)
