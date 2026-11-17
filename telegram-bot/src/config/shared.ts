export function positiveNumber(
	value: string | undefined,
	fallback: number,
	label?: string
): number {
	if (value === undefined || value.trim() === '') return fallback
	const parsed = Number(value)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		if (label) throw new Error(`${label} must be a positive number`)
		return fallback
	}
	return parsed
}

export function normalizeBackendUrl(value: string | undefined): string {
	const raw = (value ?? 'http://localhost:3001').replace(/\/$/, '')
	return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`
}
