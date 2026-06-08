import {
	Counter,
	collectDefaultMetrics,
	Gauge,
	Histogram,
	Registry,
} from 'prom-client'
import { createElysia } from '@/utils/elysia'

export const register = new Registry()

collectDefaultMetrics({ register })

function normalizeRoute(route: string): string {
	if (!route) return 'unknown'

	return route
		.replace(/^(\/player\/[^/]+)\/[^/]+/, '$1/:character')
		.replace(/^(\/auction\/[^/]+)\/[^/]+(?=\/|$)/, '$1/:id')
		.replace(/^\/barter\/[^/]+/, '/barter/:itemId')
		.replace(/\/[0-9]+(?=\/|$)/g, '/:id')
		.replace(
			/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
			'/:uuid'
		)
		.replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, '/:param')
}

export const httpRequestsTotal = new Counter({
	name: 'http_requests_total',
	help: 'Total number of HTTP requests',
	labelNames: ['method', 'route', 'status'],
	registers: [register],
})

export const httpRequestDuration = new Histogram({
	name: 'http_request_duration_seconds',
	help: 'HTTP request duration in seconds',
	labelNames: ['method', 'route', 'status'],
	buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
	registers: [register],
})

export const playerLookupsTotal = new Counter({
	name: 'player_lookups_total',
	help: 'Total number of player profile lookups',
	labelNames: ['region'],
	registers: [register],
})

export const playerLookupErrorsTotal = new Counter({
	name: 'player_lookup_errors_total',
	help: 'Total number of failed player profile lookups',
	labelNames: ['region'],
	registers: [register],
})

export const blacklistSize = new Gauge({
	name: 'blacklist_size',
	help: 'Current number of players in the blacklist',
	registers: [register],
})

export const recentPlayersSize = new Gauge({
	name: 'recent_players_size',
	help: 'Current number of players in the recent players list',
	registers: [register],
})

export const popularPlayerViewsTotal = new Counter({
	name: 'popular_player_views_total',
	help: 'Total view increments for popular players',
	registers: [register],
})

export const auctionRequestsTotal = new Counter({
	name: 'auction_requests_total',
	help: 'Total number of auction API requests',
	labelNames: ['region', 'type'],
	registers: [register],
})

export const barterRequestsTotal = new Counter({
	name: 'barter_requests_total',
	help: 'Total number of barter lookup requests',
	registers: [register],
})

export const exboApiRequestsTotal = new Counter({
	name: 'exbo_api_requests_total',
	help: 'Total number of requests to the EXBO API',
	labelNames: ['status'],
	registers: [register],
})

export const exboApiDuration = new Histogram({
	name: 'exbo_api_request_duration_seconds',
	help: 'Duration of EXBO API requests in seconds',
	buckets: [0.1, 0.5, 1, 2, 5, 10],
	registers: [register],
})

export const appErrorsTotal = new Counter({
	name: 'app_errors_total',
	help: 'Total number of application errors',
	labelNames: ['type'],
	registers: [register],
})

export const appInfo = new Gauge({
	name: 'app_info',
	help: 'Application info',
	labelNames: ['version'],
	registers: [register],
})

export function setAppVersion(version: string) {
	appInfo.reset()
	appInfo.set({ version }, 1)
}

export function setBlacklistCount(count: number) {
	blacklistSize.set(count)
}

export function setRecentPlayersCount(count: number) {
	recentPlayersSize.set(count)
}

export function normalizeAndRecordHttpRequest(params: {
	method: string
	route: string
	status: number | string
	durationSeconds: number
}) {
	const route = normalizeRoute(params.route)

	httpRequestsTotal.inc({
		method: params.method,
		route,
		status: String(params.status),
	})

	httpRequestDuration.observe(
		{
			method: params.method,
			route,
			status: String(params.status),
		},
		params.durationSeconds
	)
}

export function recordAppError(type: string) {
	appErrorsTotal.inc({ type })
}

export const metricsRoute = createElysia().get('/metrics', async ({ set }) => {
	set.headers['Content-Type'] = register.contentType
	return register.metrics()
})
