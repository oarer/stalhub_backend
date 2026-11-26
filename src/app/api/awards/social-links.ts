export interface AwardSocialLink {
	label: string
	url: string
}

export function normalizeSocialLinks(value: unknown): AwardSocialLink[] {
	if (Array.isArray(value)) {
		return value.flatMap((item) => {
			if (!item || typeof item !== 'object') return []
			const link = item as Record<string, unknown>
			if (typeof link.label !== 'string' || typeof link.url !== 'string')
				return []
			return [{ label: link.label, url: link.url }]
		})
	}
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>
		if (typeof record.label === 'string' && typeof record.url === 'string')
			return [{ label: record.label, url: record.url }]
		return Object.entries(record).flatMap(([label, url]) =>
			typeof url === 'string' ? [{ label, url }] : []
		)
	}
	return []
}
