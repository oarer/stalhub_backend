export type BotConfig = {
	token: string
	backendUrl: string
	webAppUrl: string
	pollingTimeoutSeconds: number
	cacheTtlSeconds: number
	rateLimitPerMinute: number
	requestTimeoutMs: number
	searchDebounceMs: number
}

function positiveNumber(value: string | undefined, fallback: number): number {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function loadConfig(
	env: Record<string, string | undefined> = process.env
): BotConfig {
	const token = env.TG_BOT_TOKEN?.trim()
	if (!token) throw new Error('TG_BOT_TOKEN is not set')

	const rawBackendUrl = (env.BACKEND_URL ?? 'http://localhost:3001').replace(
		/\/$/,
		''
	)
	const backendUrl = rawBackendUrl.endsWith('/api/v1')
		? rawBackendUrl
		: `${rawBackendUrl}/api/v1`

	const rawWebAppUrl = (env.TG_WEBAPP_URL ?? 'https://stalhub.dev').replace(
		/\/$/,
		''
	)
	const webAppUrl = new URL(rawWebAppUrl)
	const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(
		webAppUrl.hostname
	)
	if (webAppUrl.protocol !== 'https:' && !isLocalHost) {
		throw new Error('TG_WEBAPP_URL must be an https:// URL')
	}

	return {
		token,
		backendUrl,
		webAppUrl: webAppUrl.origin + webAppUrl.pathname.replace(/\/$/, ''),
		pollingTimeoutSeconds: positiveNumber(
			env.TG_POLLING_TIMEOUT_SECONDS,
			30
		),
		cacheTtlSeconds: positiveNumber(env.TG_CACHE_TTL_SECONDS, 60),
		rateLimitPerMinute: positiveNumber(env.TG_RATE_LIMIT_PER_MINUTE, 10),
		requestTimeoutMs: positiveNumber(env.TG_REQUEST_TIMEOUT_MS, 4_500),
		searchDebounceMs: positiveNumber(env.TG_SEARCH_DEBOUNCE_MS, 250),
	}
}
