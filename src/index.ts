import cors from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { normalizeAndRecordHttpRequest } from '@/app/api/metrics'
import { createElysia } from '@/utils/elysia'
import { logger } from '@/utils/logger'
import { routes } from './app'
import { env } from './env'

export const app = createElysia()
	.use(swagger({
		documentation: {
			info: {
				title: 'StalHub Documentation',
				version: '1.0.0'
			}
		}
	}))
	.use(cors())
	.use(logger)
	.use(routes)
	.onRequest(({ store }) => {
		; (store as Record<string, unknown>)._reqStart = Date.now()
	})
	.onAfterHandle(({ request, set, store }) => {
		const start = (store as Record<string, unknown>)._reqStart as
			| number
			| undefined
		normalizeAndRecordHttpRequest({
			method: request.method,
			route: new URL(request.url).pathname,
			status: set.status ?? 200,
			durationSeconds: start ? (Date.now() - start) / 1000 : 0,
		})
	})

	.listen({ port: env.PORT }, ({ hostname, port }) => {
		const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
		console.log(
			`StalHub backend started on: ${protocol}://${hostname}:${port}`
		)
	})

export type App = typeof app
