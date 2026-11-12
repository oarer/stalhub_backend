import './setup-typebox'
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
import {
	isAllowedUnoRequest,
	STALHUB_ORIGIN_RE,
	UNO_MAX_URL_LENGTH,
} from '@/app/api/uno/request-policy'
import { clientIp, enforceRateLimit, shouldSkipRps } from '@/utils/auto-ban'
import {
	isUnoManuallyBanned,
	recordUnoAbuse,
	recordUnoHit,
	unoErrorStatus,
} from '@/utils/auto-ban/uno'
import { createElysia } from '@/utils/elysia'
import { logger } from '@/utils/logger'
import { routes } from './app'
import { crons } from './crons'
import { env, TRUST_PROXY_IPS } from './env'

function recordUnoError(ip: string, route: string, status: number): void {
	recordUnoAbuse(ip, { route, status }).catch((err) => {
		console.error('[AutoBan] recordUnoAbuse failed:', err)
	})
}

let lastProxyHeadersWarn = 0

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
	.get(
		'/uploads/*',
		async ({
			params,
			set,
		}: {
			params: Record<string, string>
			set: {
				status?: number | string
				headers: Record<string, string | number | string[]>
			}
		}) => {
			const decodedPath = decodeURIComponent(params['*'])

			if (
				decodedPath.includes('..') ||
				decodedPath.includes('\0') ||
				decodedPath.includes('\\')
			) {
				set.status = 403
				return 'Forbidden'
			}

			// if (isS3Uploads()) {
			// 	const url = s3PublicUrl(`/uploads/${decodedPath}`)
			// 	if (!url) {
			// 		set.status = 403
			// 		return 'Forbidden'
			// 	}
			// 	set.status = 302
			// 	set.headers.location = url
			// 	return
			// }

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

				// Изображения и аудио (nosniff + sandbox) — загруженный
				// HTML/JS не должен исполняться в origin API.
				const mime = file.type || 'application/octet-stream'
				if (!/^(image|audio)\//.test(mime)) {
					set.status = 403
					return 'Forbidden'
				}
				set.headers['x-content-type-options'] = 'nosniff'
				set.headers['content-security-policy'] =
					"default-src 'none'; sandbox"
				return file
			} catch {
				set.status = 400
				return 'Bad request'
			}
		}
	)

	.onRequest(async ({ request, set, store, server }) => {
		;(store as Record<string, unknown>)._reqStart = Date.now()

		const pathname = new URL(request.url).pathname
		const isUnoRequest = pathname.startsWith('/api/v1/uno/')
		if (shouldSkipRps(pathname)) return

		const headers = Object.fromEntries(request.headers)
		const remoteIp = server?.requestIP?.(request)?.address ?? ''
		const ip = clientIp(headers, remoteIp)

		if (isUnoRequest) {
			if (
				!headers['x-real-ip'] &&
				!headers['x-forwarded-for'] &&
				Date.now() - lastProxyHeadersWarn >= 60_000
			) {
				lastProxyHeadersWarn = Date.now()
				console.warn(
					'[AutoBan] trusted socket without proxy headers (X-Real-IP / X-Forwarded-For missing) — check reverse proxy config'
				)
			}
			recordUnoHit(ip).catch((err) =>
				console.error('[AutoBan] recordUnoHit failed:', err)
			)
			if (await isUnoManuallyBanned(ip)) {
				set.status = 403
				return { error: 'Forbidden (banned)' }
			}
		}

		if (isUnoRequest && !isAllowedUnoRequest(request, allowedOrigins)) {
			set.status = 403
			recordUnoError(ip, pathname, 403)
			return { error: 'Forbidden origin' }
		}
		if (isUnoRequest && request.url.length > UNO_MAX_URL_LENGTH) {
			set.status = 414
			recordUnoError(ip, pathname, 414)
			return { error: 'UNO request URI too long' }
		}

		const routePath = pathname.startsWith('/api/v1')
			? pathname.slice('/api/v1'.length)
			: pathname
		const blocked = await enforceRateLimit(
			ip,
			normalizeRoute(routePath),
			isUnoRequest ? env.UNO_RPS_THRESHOLD : env.RPS_THRESHOLD
		)
		if (blocked) {
			set.status = 429
			return { error: 'Too many requests, try again later' }
		}
	})
	.onAfterHandle(({ request, set, store, server }) => {
		const start = (store as Record<string, unknown>)._reqStart as
			| number
			| undefined
		const pathname = new URL(request.url).pathname
		normalizeAndRecordHttpRequest({
			method: request.method,
			route: pathname,
			status: set.status ?? 200,
			duration_seconds: start ? (Date.now() - start) / 1000 : 0,
		})
		const status = unoErrorStatus(set.status)
		if (pathname.startsWith('/api/v1/uno/') && status >= 400) {
			const headers = Object.fromEntries(request.headers)
			const remoteIp = server?.requestIP?.(request)?.address ?? ''
			const ip = clientIp(headers, remoteIp)
			recordUnoError(ip, pathname, status)
		}
	})
	.onError(({ request, set, server, error }) => {
		const pathname = new URL(request.url).pathname
		if (!pathname.startsWith('/api/v1/uno/')) return
		const errorStatus =
			typeof (error as { status?: unknown })?.status === 'number'
				? (error as { status: number }).status
				: unoErrorStatus(set.status)
		const status = errorStatus >= 400 ? errorStatus : 500
		const headers = Object.fromEntries(request.headers)
		const remoteIp = server?.requestIP?.(request)?.address ?? ''
		const ip = clientIp(headers, remoteIp)
		recordUnoError(ip, pathname, status)
	})

	.use(routes)

	.listen({ port: env.PORT }, ({ hostname, port }) => {
		const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
		console.log(
			`StalHub backend started on: ${protocol}://${hostname}:${port}`
		)
		console.log(
			`[AutoBan] trusted proxy CIDRs: ${
				TRUST_PROXY_IPS.length ? TRUST_PROXY_IPS.join(', ') : '(none)'
			}`
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
