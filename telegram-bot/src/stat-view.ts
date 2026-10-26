import {
	bold,
	expandableBlockquote,
	type FormattableString,
	format,
} from 'gramio'
import { CLAN_RANK_NAMES, FACTION_NAMES } from './format'
import catalog from './stat-catalog.json'
import {
	extractMetrics,
	formatDate,
	formatHours,
	formatMetric,
	type PlayerProfile,
} from './stats'

const STATS = catalog as StatMeta[]

export type StatType = 'INTEGER' | 'DECIMAL' | 'DURATION' | 'DATE'

export type StatCategory =
	| 'COMBAT'
	| 'SURVIVAL'
	| 'EXPLORATION'
	| 'SESSION_MODES'
	| 'ECONOMY'
	| 'HIDEOUT'

export type StatMeta = {
	id: string
	category: StatCategory
	type: StatType
	ru: string
}

export type StatCategoryKey =
	| 'combat'
	| 'survival'
	| 'exploration'
	| 'session'
	| 'economy'
	| 'hideout'

export const CLAN_KIND = 'history' as const

export type StatViewKind = StatCategoryKey | typeof CLAN_KIND

export type CategoryMeta = {
	key: StatCategoryKey
	name: string
	label: string
	title: string
}

export const CATEGORIES: CategoryMeta[] = [
	{ key: 'combat', name: 'COMBAT', label: 'Боёвка', title: 'Combat' },
	{
		key: 'survival',
		name: 'SURVIVAL',
		label: 'Выживание',
		title: 'Survival',
	},
	{
		key: 'exploration',
		name: 'EXPLORATION',
		label: 'Исследование',
		title: 'Explore',
	},
	{
		key: 'session',
		name: 'SESSION_MODES',
		label: 'Сессии',
		title: 'Sessions',
	},
	{ key: 'economy', name: 'ECONOMY', label: 'Экономика', title: 'Economy' },
	{ key: 'hideout', name: 'HIDEOUT', label: 'Убежище', title: 'Hideout' },
]

const CATEGORY_BY_KEY = new Map<string, CategoryMeta>(
	CATEGORIES.map((item) => [item.key, item])
)
const CATEGORY_BY_NAME = new Map<string, CategoryMeta>(
	CATEGORIES.map((item) => [item.name, item])
)

export const METAS_BY_CATEGORY = new Map(
	CATEGORIES.map((item) => [
		item.key,
		STATS.filter((stat) => stat.category === item.name),
	])
)

export function categoryMeta(key: string): CategoryMeta | null {
	return CATEGORY_BY_KEY.get(key) ?? null
}

export function categoryByName(name: string): CategoryMeta | null {
	return CATEGORY_BY_NAME.get(name) ?? null
}

export function statMeta(id: string): StatMeta | null {
	return STATS.find((stat) => stat.id === id) ?? null
}

type DecimalFormatConfig = { divisor: number; unit?: string; precision: number }

const DECIMAL_CONFIG: Record<string, DecimalFormatConfig> = {
	'foo-eat': { divisor: 1, unit: 'kg', precision: 2 },
	'dam-dea-pla': { divisor: 1, unit: 'unit', precision: 0 },
	'dam-rec-pla': { divisor: 1, unit: 'unit', precision: 0 },
	'dam-dea-all': { divisor: 1, unit: 'unit', precision: 0 },
	'dam-rec-all': { divisor: 1, unit: 'unit', precision: 0 },
	'dam-exp': { divisor: 1, unit: 'unit', precision: 0 },
	'scout-powerful-shot-damage-ops': {
		divisor: 1,
		unit: 'unit',
		precision: 0,
	},
	'scout-powerful-shot-max-damage-ops': {
		divisor: 1,
		unit: 'unit',
		precision: 0,
	},
	'support-healed-ops': { divisor: 1, unit: 'unit', precision: 0 },
	'tank-damage-delayed-ops': { divisor: 1, unit: 'unit', precision: 0 },
	'tank-ultimate-max-damage-ops': { divisor: 1, unit: 'unit', precision: 0 },
}

const UNIT_LABELS = new Map([
	['km', 'км'],
	['kg', 'кг'],
	['unit', 'ед.'],
	['hours', 'ч.'],
])

const numberFormatter = new Intl.NumberFormat('ru-RU')

function unitLabel(unit: string): string {
	return UNIT_LABELS.get(unit) ?? unit
}

export function formatStatValue(
	value: unknown,
	meta: Pick<StatMeta, 'type' | 'id'>
): string {
	if (meta.type === 'DATE') {
		const date = new Date(String(value))
		if (Number.isNaN(date.getTime())) return String(value)
		return new Intl.DateTimeFormat('ru-RU', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			timeZone: 'UTC',
		}).format(date)
	}
	const num = typeof value === 'number' ? value : Number(value)
	if (
		value === null ||
		value === undefined ||
		value === '' ||
		!Number.isFinite(num)
	)
		return '—'
	if (meta.type === 'DURATION') {
		const hours = num / (1000 * 60 * 60)
		const rounded = Math.round(hours * 100) / 100
		return `${numberFormatter.format(rounded)} ${unitLabel('hours')}`
	}
	if (meta.type === 'DECIMAL') {
		const config = DECIMAL_CONFIG[meta.id] ?? {
			divisor: 100000,
			precision: 2,
			unit: 'km',
		}
		const scaled = num / config.divisor
		const formatted = new Intl.NumberFormat('ru-RU', {
			maximumFractionDigits: config.precision,
			minimumFractionDigits: config.precision,
		}).format(scaled)
		return config.unit
			? `${formatted} ${unitLabel(config.unit)}`
			: formatted
	}
	return numberFormatter.format(Math.round(num))
}

export function collectCategoryStats(
	profile: PlayerProfile,
	category: CategoryMeta
): Array<{ meta: StatMeta; text: string }> {
	const values = new Map<string, unknown>()
	for (const stat of profile.stats ?? []) {
		if (typeof stat?.id === 'string') values.set(stat.id, stat.value)
	}
	const out: Array<{ meta: StatMeta; text: string }> = []
	for (const meta of METAS_BY_CATEGORY.get(category.key) ?? []) {
		if (!values.has(meta.id)) continue
		out.push({ meta, text: formatStatValue(values.get(meta.id), meta) })
	}
	return out
}

function truncateText(value: string, maxLength: number): string {
	const characters = [...value]
	return characters.length > maxLength
		? `${characters.slice(0, maxLength - 1).join('')}…`
		: characters.join('')
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

const FONT_STACK = 'CoverExtended, MTS Extended, DejaVu Sans, sans-serif'

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

type CardCell = { label: string; value: string }

function mainCells(profile: PlayerProfile): CardCell[] {
	const metrics = extractMetrics(profile)
	const clan = profile.clan?.info?.name
	const clanTag = profile.clan?.info?.tag
	const faction = profile.alliance
	return [
		{ label: 'K/D', value: formatMetric(metrics.kd) },
		{
			label: 'K/D в противостояниях',
			value: formatMetric(metrics.battleKd),
		},
		{ label: 'Часы в игре', value: formatHours(metrics.hours) },
		{ label: 'Точность', value: `${formatMetric(metrics.accuracy)}%` },
		{ label: 'Начал играть', value: formatDate(metrics.registeredAt) },
		{
			label: 'Клан',
			value: clan ? `${clanTag ? `[${clanTag}] ` : ''}${clan}` : '—',
		},
		{
			label: 'Фракция',
			value: FACTION_NAMES.get(faction ?? '') ?? faction ?? '—',
		},
	]
}

function statCardCells(
	profile: PlayerProfile,
	category: CategoryMeta
): CardCell[] {
	return collectCategoryStats(profile, category).map(({ meta, text }) => ({
		label: meta.ru,
		value: text,
	}))
}

function categoryColumnCount(cells: number): number {
	if (cells > 33) return 4
	if (cells > 12) return 3
	return 2
}

function categoryCard(
	profile: PlayerProfile,
	category: CategoryMeta,
	cells: CardCell[]
): string {
	const columns = categoryColumnCount(cells.length)
	const rowsCount = Math.max(1, Math.ceil(cells.length / columns))
	const gridTop = 196
	const gridBottom = CARD_HEIGHT - 44
	const rowGap = 10
	const available = gridBottom - gridTop - (rowsCount - 1) * rowGap
	const rowHeight = Math.max(
		24,
		Math.min(64, Math.floor(available / rowsCount))
	)
	const columnGap = 14
	const columnWidth = Math.floor(
		(CARD_WIDTH - 48 - (columns - 1) * columnGap) / columns
	)
	const fontSize = Math.max(14, Math.min(22, Math.floor(rowHeight * 0.55)))
	const labelLimit = columns >= 4 ? 20 : columns === 3 ? 26 : 30

	const cellMarkup = cells
		.map((cell, index) => {
			const column = index % columns
			const row = Math.floor(index / columns)
			const x = 24 + column * (columnWidth + columnGap)
			const y = gridTop + row * (rowHeight + rowGap)
			return `\t\t\t<rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight}" rx="10" fill="#141419"/>
\t\t\t<text x="${x + 14}" y="${y + rowHeight / 2 + fontSize * 0.35}" font-family="${FONT_STACK}" font-size="${fontSize}" fill="#9ca3af">${escapeXml(truncateText(cell.label, labelLimit))}</text>
\t\t\t<text x="${x + columnWidth - 14}" text-anchor="end" y="${y + rowHeight / 2 + fontSize * 0.35}" font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="bold" fill="#f9fafb">${escapeXml(cell.value)}</text>`
		})
		.join('\n')

	return cardShell(profile, category.label, cellMarkup)
}

function mainCard(profile: PlayerProfile, cells: CardCell[]): string {
	const columns = 2
	const rowsCount = Math.ceil(cells.length / columns)
	const gridTop = 196
	const gridBottom = CARD_HEIGHT - 44
	const rowGap = 12
	const available = gridBottom - gridTop - (rowsCount - 1) * rowGap
	const rowHeight = Math.max(64, Math.floor(available / rowsCount))
	const columnGap = 14
	const columnWidth = Math.floor((CARD_WIDTH - 48 - columnGap) / columns)
	const labelSize = 20
	const valueSize = 34

	const cellMarkup = cells
		.map((cell, index) => {
			const column = index % columns
			const row = Math.floor(index / columns)
			const x = 24 + column * (columnWidth + columnGap)
			const y = gridTop + row * (rowHeight + rowGap)
			return `\t\t\t<rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight - rowGap}" rx="12" fill="#141419"/>
\t\t\t<text x="${x + 16}" y="${y + labelSize + 8}" font-family="${FONT_STACK}" font-size="${labelSize}" fill="#9ca3af">${escapeXml(truncateText(cell.label, 30))}</text>
\t\t\t<text x="${x + 16}" y="${y + labelSize + valueSize + 12}" font-family="${FONT_STACK}" font-size="${valueSize}" font-weight="bold" fill="#f9fafb">${escapeXml(cell.value)}</text>`
		})
		.join('\n')

	return cardShell(profile, 'Общая статистика', cellMarkup)
}

function cardShell(
	profile: PlayerProfile,
	subtitle: string,
	cellMarkup: string
): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#111118"/>
			<stop offset="1" stop-color="#0a0a0c"/>
		</linearGradient>
	</defs>
	<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>
	<rect width="${CARD_WIDTH}" height="6" fill="#61a8e0"/>
	<text x="24" y="76" font-family="${FONT_STACK}" font-size="56" font-weight="bold" fill="#f9fafb">${escapeXml(truncateText(profile.username || 'Сталкер', 24))}</text>
	<text x="24" y="134" font-family="${FONT_STACK}" font-size="30" fill="#9ca3af">${escapeXml(subtitle)}</text>
	<text x="24" y="172" font-family="${FONT_STACK}" font-size="24" fill="#9ca3af">${escapeXml(truncateText(profileSubtitle(profile), 100))}</text>
${cellMarkup}
	<text x="${CARD_WIDTH - 24}" y="${CARD_HEIGHT - 16}" text-anchor="end" font-family="${FONT_STACK}" font-size="20" fill="#4b5563">StalHub</text>
</svg>`
}

function profileSubtitle(profile: PlayerProfile): string {
	const metrics = extractMetrics(profile)
	const clan = profile.clan?.info?.name
	const clanTag = profile.clan?.info?.tag
	const parts = [
		`K/D: ${formatMetric(metrics.kd)}`,
		`K/D противостояния: ${formatMetric(metrics.battleKd)}`,
		clan ? `Клан: ${clan}${clanTag ? ` [${clanTag}]` : ''}` : null,
		`Часы: ${formatHours(metrics.hours)}`,
	]
	return parts.filter(Boolean).join(' · ')
}

export function renderMainStatsSvg(profile: PlayerProfile): string {
	return mainCard(profile, mainCells(profile))
}

export function renderCategoryStatsSvg(
	profile: PlayerProfile,
	category: CategoryMeta
): string {
	return categoryCard(profile, category, statCardCells(profile, category))
}

export function categoryStatsText(
	profile: PlayerProfile,
	category: CategoryMeta
): FormattableString {
	const cells = statCardCells(profile, category)
	const lines = cells.map((cell) => `${cell.label} — ${bold(cell.value)}`)
	return format`${bold`${category.label} | ${profile.username}`}

${expandableBlockquote(lines.join('\n'))}`
}

export function clanHistoryText(profile: PlayerProfile): FormattableString {
	const history = profile.clan_history ?? []
	const lines = history.map((entry) => {
		const name = `${entry.clan_name}${entry.clan_tag ? ` [${entry.clan_tag}]` : ''}`
		return `${name} · ${rankName(entry.rank)} · ${entry.region} · ${formatDate(entry.joined_at ?? entry.seen_at)}`
	})
	return format`${bold`История кланов | ${profile.username}`}

${expandableBlockquote(lines.join('\n'))}`
}

const MAX_CAPTION_LENGTH = 1024

export function clanHistoryCaption(profile: PlayerProfile): string {
	const history = profile.clan_history ?? []
	const header = `📜 История кланов ${profile.username}`
	const lines = history.map((entry) => {
		const name = `${entry.clan_name}${entry.clan_tag ? ` [${entry.clan_tag}]` : ''}`
		return `${name} · ${rankName(entry.rank)} · ${formatDate(entry.joined_at ?? entry.seen_at)}`
	})
	let body = lines.join('\n')
	if (header.length + body.length + 1 > MAX_CAPTION_LENGTH) {
		const limit = MAX_CAPTION_LENGTH - header.length - 2
		body = `${truncateText(body, limit)}`
	}
	return lines.length === 0 ? `${header}\nКланов нет.` : `${header}\n${body}`
}

export function rankName(value: string | null | undefined): string {
	if (!value) return '—'
	return CLAN_RANK_NAMES.get(value.trim().toLowerCase()) ?? value
}
