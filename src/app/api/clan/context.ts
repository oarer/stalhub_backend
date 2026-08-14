import { Elysia } from 'elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'

export const clanContext = new Elysia({ name: 'clan:context' })
	.use(jwtPlugin)
	.state('authUserId', undefined as number | undefined)
	.state('clanId', undefined as string | undefined)
	.as('scoped')
