import { createElysia } from '@/utils/elysia'
import { permissionsRoutes } from './permissions'
import { rolesRoutes } from './roles'
import { usersRoutes } from './users'
import { jwtPlugin } from '@/utils/jwt.plugin'

export const adminRoutes = createElysia()
	.use(jwtPlugin)
	.group('/admin', (app) =>
		app
			.use(permissionsRoutes)
			.use(rolesRoutes)
			.use(usersRoutes)
	)