export function parseFeedIcon(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null
	const icon = (value as { icon?: unknown }).icon
	if (typeof icon !== 'string') return null
	try {
		const url = new URL(icon)
		return url.protocol === 'http:' || url.protocol === 'https:'
			? url.href
			: null
	} catch {
		return null
	}
}
