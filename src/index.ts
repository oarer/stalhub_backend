import { relative, resolve } from 'node:path'
import cors from '@elysia/cors'
import { openapi } from '@elysia/openapi'
import { setFileTypeDetector } from 'elysia'
import { fileTypeFromBlob } from 'file-type'
import { goldService } from '@/app/api/clan/services/gold'
import {
	normalizeAndRecordHttpRequest,
	normalizeRoute,
} from '@/app/api/metrics'
import { isS3Uploads, s3PublicUrl } from '@/lib/uploads'
import { clientIp, enforceRateLimit, shouldSkipRps } from '@/utils/auto-ban'
import { createElysia } from '@/utils/elysia'
import { logger } from '@/utils/logger'
import { routes } from './app'
import { crons } from './crons'
import { env } from './env'

function originOf(url: string | undefined): string | null {
	if (!url) return null
	try {
		const u = new URL(url)
		return `${u.protocol}//${u.host}`
	} catch {
		return null
	}
}

const allowedOrigins: string[] = [
	...new Set(
		[
			originOf(env.WEB_ORIGIN),
			originOf(env.DESKTOP_AUTH_ORIGIN),
			originOf(env.BLOG_PUBLIC_BASE_URL),
			originOf(env.BLOG_OG_BASE_URL),

			'http://localhost:3000',
			'http://localhost:3001',
		].filter((v): v is string => !!v)
	),
]

const STALHUB_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*stalhub\.dev$/

setFileTypeDetector(async (file) => {
	const result = await fileTypeFromBlob(file)
	return result?.mime
})

export const app = createElysia()
	.use(crons)
	.use(
		openapi({
			documentation: {
				info: {
					title: 'StalHub Documentation',
					version: '1.0.0',
				},
			},
		})
	)
	.use(
		cors({
			origin: [...allowedOrigins, STALHUB_ORIGIN_RE],
			credentials: true,
		})
	)
	.use(logger)

	// static
	.get('/uploads/*', async ({ params, set }: { params: Record<string, string>; set: { status?: number | string; headers: Record<string, string | number | string[]> } }) => {
		const decodedPath = decodeURIComponent(params['*'])

		if (
			decodedPath.includes('..') ||
			decodedPath.includes('\0') ||
			decodedPath.includes('\\')
		) {
			set.status = 403
			return 'Forbidden'
		}

		if (isS3Uploads()) {
			const url = s3PublicUrl(`/uploads/${decodedPath}`)
			if (!url) {
				set.status = 403
				return 'Forbidden'
			}
			set.status = 302
			set.headers.location = url
			return
		}

		const uploadsDir = resolve(process.cwd(), 'uploads')
		try {
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

	.request(async ({ request, set, store, server }) => {
		;(store as Record<string, unknown>)._reqStart = Date.now()

		const pathname = new URL(request.url).pathname
		if (shouldSkipRps(pathname)) return

		const headers = Object.fromEntries(request.headers)
		const remoteIp = server?.requestIP?.(request)?.address ?? ''
		const ip = clientIp(headers, remoteIp)
		const routePath = pathname.startsWith('/api/v1')
			? pathname.slice('/api/v1'.length)
			: pathname
		const blocked = await enforceRateLimit(ip, normalizeRoute(routePath))
		if (blocked) {
			set.status = 429
			return { error: 'Too many requests, try again later' }
		}
	})
	.afterHandle(({ request, set, store }) => {
		const start = (store as Record<string, unknown>)._reqStart as
			| number
			| undefined
		normalizeAndRecordHttpRequest({
			method: request.method,
			route: new URL(request.url).pathname,
			status: set.status ?? 200,
			duration_seconds: start ? (Date.now() - start) / 1000 : 0,
		})
	})

	.use(routes)

	.listen({ port: env.PORT }, ({ hostname, port }) => {
		const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
		console.log(
			`StalHub backend started on: ${protocol}://${hostname}:${port}`
		)
		goldService.createSchedule(2).catch((err) => {
			console.error('Failed to create gold drop schedule:', err)
		})
		import('@/app/api/sc-gateway/pool')
			.then(({ ensureSeeded }) => ensureSeeded())
			.catch((err) => {
				console.error('Failed to seed SC token pool:', err)
			})
	})

export type App = typeof app
