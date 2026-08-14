import { relative, resolve } from 'node:path'
import cors from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { goldService } from '@/app/api/clan/services/gold'
import { normalizeAndRecordHttpRequest } from '@/app/api/metrics'
import { createElysia } from '@/utils/elysia'
import { logger } from '@/utils/logger'
import { routes } from './app'
import { crons } from './crons'
import { env } from './env'

export const app = createElysia()
	.use(crons)
	.use(
		swagger({
			documentation: {
				info: {
					title: 'StalHub Documentation',
					version: '1.0.0',
				},
			},
		})
	)
	.use(cors())
	.use(logger)
	.use(routes)

	// static
	.get('/uploads/*', async ({ params, set }) => {
		const uploadsDir = resolve(process.cwd(), 'uploads')
		try {
			const decodedPath = decodeURIComponent(params['*'])

			const requested = resolve(uploadsDir, decodedPath)

			const rel = relative(uploadsDir, requested)

			if (
				rel.startsWith('..') ||
				resolve(uploadsDir, rel) !== requested
			) {
				set.status = 403
				return 'Forbidden'
			}

			const file = Bun.file(requested)

			if (!(await file.exists())) {
				set.status = 404
				return 'Not found'
			}

			return file
		} catch {
			set.status = 400
			return 'Bad request'
		}
	})

	.onRequest(({ store }) => {
		;(store as Record<string, unknown>)._reqStart = Date.now()
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
		goldService.createSchedule(2).catch((err) => {
			console.error('Failed to create gold drop schedule:', err)
		})
	})

export type App = typeof app
