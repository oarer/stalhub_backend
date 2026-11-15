import { env } from '@/env'

/** Формат пути в SC-CDN: модели лежат в namespace sc/stalker/. */
const CDB_PATH_PREFIX = 'sc/stalker/'

export interface NormalizeAssetUrlOptions {
	baseUrl?: string
	pathPrefix?: string
}

function normalizeAssetPath(path: string): string | undefined {
	const normalized = path.replace(/^\/+/, '')
	if (!normalized || normalized.split('/').some((part) => part === '..'))
		return undefined
	return normalized
}

/**
 * Нормализация пути ассета из UNO API в публичный URL CDN:
 * `ns:path` → `${CDN}/${ns}/${path}`, относительный → под sc/stalker/,
 * абсолютный http(s) → как есть, null/пусто → undefined.
 */
export function normalizeAssetUrl(
	value: string | null | undefined,
	options: NormalizeAssetUrlOptions = {}
): string | undefined {
	if (!value || typeof value !== 'string') return undefined
	const raw = value.trim()
	if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return undefined

	if (/^https?:\/\//i.test(raw)) {
		try {
			const url = new URL(raw)
			if (
				url.username ||
				url.password ||
				url.pathname.split('/').some((part) => part === '..')
			)
				return undefined
			return url.toString()
		} catch {
			return undefined
		}
	}

	const baseUrl = (options.baseUrl ?? env.SC_ASSETS_CDN_URL).replace(
		/\/+$/,
		''
	)
	const configuredPathPrefix = options.pathPrefix
	const pathPrefix = (configuredPathPrefix ?? CDB_PATH_PREFIX).replace(
		/^\/+|\/+$/g,
		''
	)
	const namespaced = raw.match(/^([a-z0-9_-]+):(.+)$/i)
	if (namespaced) {
		const [, namespace, namespacedPath] = namespaced
		const path = normalizeAssetPath(namespacedPath)
		if (!path) return undefined
		const namespacePath = configuredPathPrefix
			? `${pathPrefix}/${namespace}`
			: namespace
		return `${baseUrl}/${namespacePath}/${path}`
	}

	const path = normalizeAssetPath(raw)
	if (!path) return undefined
	const relativePath = path.startsWith(`${pathPrefix}/`)
		? path.slice(pathPrefix.length + 1)
		: path
	return `${baseUrl}/${pathPrefix}/${relativePath}`
}
