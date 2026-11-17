export type PlayerStat = {
	id: string
	value: unknown
}

export type ClanHistoryEntry = {
	id: number
	player_name: string
	region: string
	clan_id: string
	clan_name: string
	clan_tag: string
	alliance: string
	rank: string
	joined_at: string | null
	seen_at: string
}

export type PlayerProfile = {
	username: string
	status?: string | null
	alliance?: string | null
	stats?: PlayerStat[] | null
	clan?: {
		info?: { name?: string | null; tag?: string | null } | null
	} | null
	clan_history?: ClanHistoryEntry[] | null
}

export type PlayerMetrics = {
	kd: number | null
	battleKd: number | null
	hours: number | null
	registeredAt: string | null
	accuracy: number | null
}

function valueOf(profile: PlayerProfile, id: string): unknown {
	return profile.stats?.find((stat) => stat.id === id)?.value
}

function numberValue(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

function ratio(
	numerator: number | null,
	denominator: number | null
): number | null {
	if (numerator === null || denominator === null) return null
	if (denominator === 0) return numerator > 0 ? numerator : null
	return numerator / denominator
}

export function extractMetrics(profile: PlayerProfile): PlayerMetrics {
	const kills = numberValue(valueOf(profile, 'kil'))
	const deaths = numberValue(valueOf(profile, 'bul-dea'))
	const battleKills = numberValue(valueOf(profile, 'kills-bf'))
	const battleDeaths = numberValue(valueOf(profile, 'deaths-bf'))
	const playedMs = numberValue(valueOf(profile, 'pla-tim'))
	const shotsHit = numberValue(valueOf(profile, 'sho-hit'))
	const shotsFired = numberValue(valueOf(profile, 'sho-fir'))
	const registered = valueOf(profile, 'reg-tim')

	return {
		kd: ratio(kills, deaths),
		battleKd: ratio(battleKills, battleDeaths),
		hours: playedMs === null ? null : playedMs / 3_600_000,
		registeredAt:
			registered === undefined || registered === null
				? null
				: String(registered),
		accuracy:
			shotsHit === null || shotsFired === null
				? null
				: shotsFired === 0
					? shotsHit * 100
					: (shotsHit / shotsFired) * 100,
	}
}

export function formatMetric(value: number | null, digits = 2): string {
	return value === null ? '—' : value.toFixed(digits)
}

export function formatHours(value: number | null): string {
	return value === null ? '—' : `${value.toFixed(0)} ч.`
}

export function formatDate(value: string | null): string {
	if (!value) return '—'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return new Intl.DateTimeFormat('ru-RU', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(date)
}
