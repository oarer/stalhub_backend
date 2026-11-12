import {
	Counter,
	collectDefaultMetrics,
	Gauge,
	Histogram,
	Registry,
} from 'prom-client'
import { createElysia } from '@/utils/elysia'
import { mapMetricRoute } from '../map3d/request-policy'

export const register = new Registry()

collectDefaultMetrics({ register })

export function normalizeRoute(route: string): string {
	if (!route) return 'unknown'
	const mapRoute = mapMetricRoute(route)
	if (mapRoute) return mapRoute

	return route
		.replace(/^(\/player\/[^/]+)\/[^/]+/, '$1/:character')
		.replace(/^(\/auction\/[^/]+)\/[^/]+(?=\/|$)/, '$1/:id')
		.replace(/^\/barter\/[^/]+/, '/barter/:item_id')
		.replace(/\/[0-9]+(?=\/|$)/g, '/:id')
		.replace(
			/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
			'/:uuid'
		)
		.replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, '/:param')
}

const UNO_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UNO_STATIC_SEGMENT_PATTERN = /^[a-z][a-z0-9_-]*$/i
const UNO_MAX_SEGMENTS = 8

function unoGenericRoute(segments: string[]): string {
	const [head, ...rest] = segments
	if (!UNO_STATIC_SEGMENT_PATTERN.test(head) || head.length >= 16) {
		return 'unknown'
	}
	const parts = rest.map((segment) => {
		if (UNO_UUID_PATTERN.test(segment)) return ':uuid'
		if (/^\d+$/.test(segment)) return ':number'
		if (segment.length >= 16) return ':param'
		if (UNO_STATIC_SEGMENT_PATTERN.test(segment)) return segment
		return null
	})
	if (parts.some((part) => part === null)) return 'unknown'
	return `/${[head, ...parts].join('/')}`
}

export function normalizeUnoRoute(path: string): string {
	if (!path || !path.startsWith('/')) return 'unknown'
	const segments = path.split('/').filter(Boolean)
	if (segments.length === 0 || segments.length > UNO_MAX_SEGMENTS) {
		return 'unknown'
	}

	const [head, ...rest] = segments

	switch (head) {
		case 'player-session':
		case 'health':
		case 'calendar':
		case 'coverage':
		case 'leaderboard':
		case 'seasons':
		case 'rules':
			return rest.length === 0 ? `/${head}` : 'unknown'
		case 'auction':
			return rest.length === 1 && rest[0] === 'lots'
				? '/auction/lots'
				: 'unknown'
		case 'players': {
			if (rest.length === 0) return '/players'
			if (rest.length === 1) return '/players/:nickname'
			if (rest.length === 2 && rest[1] === 'gear') {
				return '/players/:nickname/gear'
			}
			return 'unknown'
		}
		case 'clans': {
			if (rest.length === 0) return '/clans'
			if (rest.length === 1) return '/clans/:clan_id'
			if (rest.length === 2) {
				switch (rest[1]) {
					case 'history':
						return '/clans/:clan_id/history'
					case 'analytics':
						return '/clans/:clan_id/analytics'
					case 'rating-history':
						return '/clans/:clan_id/rating-history'
					default:
						return 'unknown'
				}
			}
			if (rest.length === 3 && rest[1] === 'vs') {
				return '/clans/:clan_id/vs/:opponent_id'
			}
			return 'unknown'
		}
		case 'grids': {
			if (rest.length === 0) return '/grids'
			if (rest.length === 1) return '/grids/:grid_id'
			if (rest.length === 2 && rest[1] === 'export') {
				return '/grids/:grid_id/export'
			}
			if (
				rest.length === 3 &&
				rest[1] === 'groups' &&
				/^\d+$/.test(rest[2])
			) {
				return '/grids/:grid_id/groups/:number'
			}
			return 'unknown'
		}
		default:
			return unoGenericRoute(segments)
	}
}

export const unoUpstreamRequestsTotal = new Counter({
	name: 'uno_upstream_requests_total',
	help: 'Total number of requests to the upstream UNO API',
	labelNames: ['route', 'status'],
	registers: [register],
})

export const unoUpstreamRequestDurationSeconds = new Histogram({
	name: 'uno_upstream_request_duration_seconds',
	help: 'Duration of upstream UNO API requests in seconds',
	labelNames: ['route'],
	buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	registers: [register],
})

export const unoUpstreamErrorsTotal = new Counter({
	name: 'uno_upstream_errors_total',
	help: 'Total number of failed upstream UNO API requests',
	labelNames: ['route', 'kind'],
	registers: [register],
})

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

export const contentViewsTotal = new Counter({
	name: 'content_views_total',
	help: 'Total view increments for content (builds, articles, arts, tier lists)',
	labelNames: ['type'],
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

export const attachmentsRequestsTotal = new Counter({
	name: 'attachments_requests_total',
	help: 'Total number of weapon attachments lookup requests',
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

export const aiAnalysisTotal = new Counter({
	name: 'ai_analysis_total',
	help: 'Total AI screenshot analyses',
	labelNames: ['status'],
	registers: [register],
})

export const aiAnalysisDuration = new Histogram({
	name: 'ai_analysis_duration_seconds',
	help: 'AI analysis duration in seconds',
	buckets: [1, 5, 10, 30, 60],
	registers: [register],
})

export const abuseWarningsTotal = new Counter({
	name: 'abuse_warnings_total',
	help: 'Total auto-ban warnings issued by the system (first violation)',
	labelNames: ['rule'],
	registers: [register],
})

export const autoBansTotal = new Counter({
	name: 'auto_bans_total',
	help: 'Total permanent auto-bans issued by the system (second violation)',
	labelNames: ['rule'],
	registers: [register],
})

export const ipBlocksTotal = new Counter({
	name: 'ip_blocks_total',
	help: 'Total IP blocks issued (rate limit / brute force)',
	registers: [register],
})

export const unoManualBansTotal = new Counter({
	name: 'uno_manual_bans_total',
	help: 'Total manual UNO IP ban/unban actions by admins',
	labelNames: ['action'],
	registers: [register],
})

export const appInfo = new Gauge({
	name: 'app_info',
	help: 'Application info',
	labelNames: ['version'],
	registers: [register],
})

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
	duration_seconds: number
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
		params.duration_seconds
	)
}

export function recordAppError(type: string) {
	appErrorsTotal.inc({ type })
}

export const metricsRoute = createElysia().get('/metrics', async ({ set }) => {
	set.headers['Content-Type'] = register.contentType
	return register.metrics()
})
