export interface ArticleCoverPanelRow {
	label: string
	value: string
	fill: number
	accent?: boolean
}

export interface ArticleCoverPanel {
	title?: string
	rows?: ArticleCoverPanelRow[]
}

export type ArticleCoverPanelMode = 'auto' | 'custom' | 'hidden'

export interface ArticleCoverConfig {
	mode?: ArticleCoverPanelMode
	preset?: string
	panel?: ArticleCoverPanel
	/** custom top-left corner glyph (emoji or short text) */
	icon?: string
}

const MAX_ROWS = 2

function toFiniteNumber(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null
	return value
}

/**
 * Normalize user-provided cover config. Returns null when there is
 * nothing to store (auto panel).
 */
export function normalizeCoverConfig(value: unknown): ArticleCoverConfig | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null

	const root = value as Record<string, unknown>
	const modeRaw = root.mode
	const mode: ArticleCoverPanelMode =
		modeRaw === 'custom' || modeRaw === 'hidden' ? modeRaw : 'auto'

	const iconRaw =
		typeof root.icon === 'string' ? root.icon.trim().slice(0, 12) : ''
	const icon = iconRaw ? iconRaw : undefined

	if (mode === 'hidden') return { mode: 'hidden', ...(icon ? { icon } : {}) }
	if (mode === 'auto') return icon ? { icon } : null

	const presetRaw =
		typeof root.preset === 'string' ? root.preset.trim().slice(0, 32) : ''

	const panelRaw = root.panel
	const panelObj =
		panelRaw && typeof panelRaw === 'object' && !Array.isArray(panelRaw)
			? (panelRaw as Record<string, unknown>)
			: {}
	const titleRaw =
		typeof panelObj.title === 'string' ? panelObj.title.trim() : ''
	const rowsRaw = Array.isArray(panelObj.rows) ? panelObj.rows : []

	const rows: ArticleCoverPanelRow[] = []
	for (const raw of rowsRaw.slice(0, MAX_ROWS)) {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
		const row = raw as Record<string, unknown>
		const label = typeof row.label === 'string' ? row.label.trim().slice(0, 24) : ''
		const val = typeof row.value === 'string' ? row.value.trim().slice(0, 16) : ''
		if (!label && !val) continue
		const fillNum = toFiniteNumber(row.fill) ?? 0
		rows.push({
			label,
			value: val,
			fill: Math.min(1, Math.max(0, fillNum)),
			...(row.accent === true ? { accent: true as const } : {}),
		})
	}

	if (!titleRaw && rows.length === 0 && !icon) return null

	return {
		mode: 'custom' as const,
		...(presetRaw ? { preset: presetRaw } : {}),
		...(icon ? { icon } : {}),
		...((titleRaw || rows.length
			? {
					panel: {
						...(titleRaw ? { title: titleRaw.slice(0, 48) } : {}),
						...(rows.length ? { rows } : {}),
					},
				}
			: {})),
	}
}
