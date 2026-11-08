import { env } from '@/env'

/** Формат пути в SC-CDN: модели лежат в namespace sc/stalker/. */
const CDB_PATH_PREFIX = 'sc/stalker/'

/**
 * Нормализация пути ассета из UNO API в публичный URL CDN:
 * `ns:path` → `${CDN}/${ns}/${path}`, относительный → под sc/stalker/,
 * абсолютный http(s) → как есть, null/пусто → undefined.
 */
export function normalizeAssetUrl(
	value: string | null | undefined
): string | undefined {
	if (!value) return undefined
	const raw = value.trim()
	if (!raw) return undefined
	if (/^https?:\/\//i.test(raw)) return raw
	const namespaced = raw.match(/^([a-z0-9_-]+):(.+)$/i)
	if (namespaced) {
		const [, namespace, path] = namespaced
		return `https://cdn.stalhub.dev/${namespace}/${path.replace(/^\/+/, '')}`
	}
	const path = raw.replace(/^\/+/, '')
	return `${env.SC_ASSETS_CDN_URL}/${CDB_PATH_PREFIX}${path}`
}
