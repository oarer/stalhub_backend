import { createElysia } from '@/utils/elysia'
import { permissionsRoutes } from './permissions'
import { rolesRoutes } from './roles'
import { usersRoutes } from './users'

export const adminRoutes = createElysia()
	.group('/admin', (app) =>
		app
			.use(permissionsRoutes)
			.use(rolesRoutes)
			.use(usersRoutes)
	)