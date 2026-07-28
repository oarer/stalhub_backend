import { createElysia } from '@/utils/elysia'
import { badgesRoutes } from './badges'
import { notificationsRoutes } from './notifications'
import { permissionsRoutes } from './permissions'
import { rolesRoutes } from './roles'
import { usersRoutes } from './users'

export const adminRoutes = createElysia()
	.group('/admin', (app) =>
		app
			.use(permissionsRoutes)
			.use(rolesRoutes)
			.use(usersRoutes)
			.use(badgesRoutes)
			.use(notificationsRoutes)
	)