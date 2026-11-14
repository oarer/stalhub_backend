export type UserbotSourceName = 'EXBO_TG' | 'STALZONE_REPORT' | 'OFFICIAL_MEDIA'

export type UserbotSource = {
	source: UserbotSourceName
	channels: string[]
}

export type UserbotConfig = {
	apiId: number
	apiHash: string
	sessionString: string
	phoneNumber?: string
	backendUrl: string
	botSecret: string
	mediaUploadUrl?: string
	requestTimeoutMs: number
	maxAttempts: number
	sources: UserbotSource[]
}

const SOURCE_KEYS: Array<[UserbotSourceName, string]> = [
	['EXBO_TG', 'USERBOT_EXBO_CHANNEL'],
	['STALZONE_REPORT', 'USERBOT_STALZONE_CHANNEL'],
	['OFFICIAL_MEDIA', 'USERBOT_OFFICIAL_MEDIA_CHANNEL'],
]

function required(
	env: Record<string, string | undefined>,
	key: string
): string {
	const value = env[key]?.trim()
	if (!value) throw new Error(`${key} is not set`)
	return value
}

function positiveNumber(
	value: string | undefined,
	fallback: number,
	label: string
): number {
	if (value === undefined || value.trim() === '') return fallback
	const parsed = Number(value)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive number`)
	}
	return parsed
}

function normalizeChannel(value: string): string {
	return value.trim().replace(/^@/, '')
}

function splitChannels(value: string): string[] {
	return [...new Set(value.split(',').map(normalizeChannel).filter(Boolean))]
}

function addSource(
	result: UserbotSource[],
	source: UserbotSourceName,
	value: unknown
): void {
	const values = Array.isArray(value) ? value : [value]
	const channels = values.flatMap((item) =>
		typeof item === 'string' ? splitChannels(item) : []
	)
	if (channels.length > 0) result.push({ source, channels })
}

function parseJsonSources(value: string): UserbotSource[] | null {
	if (!value.trim().startsWith('{') && !value.trim().startsWith('['))
		return null
	let parsed: unknown
	try {
		parsed = JSON.parse(value)
	} catch {
		throw new Error('USERBOT_SOURCES must contain valid JSON')
	}

	const result: UserbotSource[] = []
	if (Array.isArray(parsed)) {
		for (const entry of parsed) {
			if (!entry || typeof entry !== 'object') continue
			const record = entry as Record<string, unknown>
			if (
				typeof record.source === 'string' &&
				SOURCE_KEYS.some(([source]) => source === record.source)
			) {
				addSource(
					result,
					record.source as UserbotSourceName,
					record.channels ?? record.channel
				)
			}
		}
		return result
	}

	if (!parsed || typeof parsed !== 'object') {
		throw new Error('USERBOT_SOURCES JSON must be an object or array')
	}
	for (const [source] of SOURCE_KEYS) {
		addSource(result, source, (parsed as Record<string, unknown>)[source])
	}
	return result
}

export function parseUserbotSources(
	env: Record<string, string | undefined>
): UserbotSource[] {
	const configured = env.USERBOT_SOURCES?.trim()
	const fromMapping = configured ? parseJsonSources(configured) : null
	if (fromMapping) return fromMapping

	const result: UserbotSource[] = []
	for (const [source, key] of SOURCE_KEYS) {
		const value = env[key]?.trim()
		if (value) addSource(result, source, value)
	}

	if (configured) {
		for (const entry of configured.split(';')) {
			const [name, channels] = entry.split('=', 2)
			if (
				!name ||
				!channels ||
				!SOURCE_KEYS.some(([source]) => source === name.trim())
			) {
				throw new Error(
					'USERBOT_SOURCES entries must look like SOURCE=channel[,channel]'
				)
			}
			addSource(result, name.trim() as UserbotSourceName, channels)
		}
	}

	const merged = new Map<UserbotSourceName, Set<string>>()
	for (const entry of result) {
		const channels = merged.get(entry.source) ?? new Set<string>()
		for (const channel of entry.channels) channels.add(channel)
		merged.set(entry.source, channels)
	}
	return [...merged].map(([source, channels]) => ({
		source,
		channels: [...channels],
	}))
}

export function loadUserbotConfig(
	env: Record<string, string | undefined> = process.env
): UserbotConfig {
	const apiId = Number(required(env, 'TG_API_ID'))
	if (!Number.isInteger(apiId) || apiId <= 0) {
		throw new Error('TG_API_ID must be a positive integer')
	}
	const apiHash = required(env, 'TG_API_HASH')
	const botSecret = required(env, 'DISCORD_BOT_SERVICE_JWT')
	const sources = parseUserbotSources(env)
	if (sources.length === 0) {
		throw new Error(
			'At least one userbot source is required via USERBOT_EXBO_CHANNEL, USERBOT_STALZONE_CHANNEL, USERBOT_OFFICIAL_MEDIA_CHANNEL, or USERBOT_SOURCES'
		)
	}

	const rawBackendUrl = (env.BACKEND_URL ?? 'http://localhost:3001').replace(
		/\/$/,
		''
	)
	const backendUrl = rawBackendUrl.endsWith('/api/v1')
		? rawBackendUrl
		: `${rawBackendUrl}/api/v1`
	const mediaUploadUrl = env.TG_MEDIA_UPLOAD_URL?.trim().replace(/\/$/, '')

	return {
		apiId,
		apiHash,
		sessionString:
			env.TG_USERBOT_SESSION_STRING?.trim() ||
			env.TG_USERBOT_SESSION?.trim() ||
			'',
		phoneNumber: env.TG_USERBOT_PHONE?.trim() || undefined,
		backendUrl,
		botSecret,
		mediaUploadUrl: mediaUploadUrl || undefined,
		requestTimeoutMs: positiveNumber(
			env.TG_USERBOT_REQUEST_TIMEOUT_MS,
			15_000,
			'TG_USERBOT_REQUEST_TIMEOUT_MS'
		),
		maxAttempts: Math.floor(
			positiveNumber(
				env.TG_USERBOT_MAX_ATTEMPTS,
				3,
				'TG_USERBOT_MAX_ATTEMPTS'
			)
		),
		sources,
	}
}

export function sourceChannels(sources: UserbotSource[]): string[] {
	return [...new Set(sources.flatMap((source) => source.channels))]
}
