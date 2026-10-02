export const SC_EAPI_BASE_URL = 'https://eapi.stalcraft.net'

export const QUOTA_PER_MINUTE_TOKEN = 200
export const QUOTA_PER_MINUTE_NODE = 800
export const QUOTA_WINDOW_MS = 60_000

export function costOf(path: string): number {
	return path.includes('/auction/') ? 2 : 1
}
