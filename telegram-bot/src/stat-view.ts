import {
	bold,
	expandableBlockquote,
	type FormattableString,
	format,
} from 'gramio'
import { CLAN_RANK_NAMES } from './format'
import catalog from './stat-catalog.json'
import { formatDate, type PlayerProfile } from './stats'

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

type CardCell = { label: string; value: string }

function statCardCells(
	profile: PlayerProfile,
	category: CategoryMeta
): CardCell[] {
	return collectCategoryStats(profile, category).map(({ meta, text }) => ({
		label: meta.ru,
		value: text,
	}))
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

export function rankName(value: string | null | undefined): string {
	if (!value) return '—'
	return CLAN_RANK_NAMES.get(value.trim().toLowerCase()) ?? value
}
