type RecordValue = Record<string, unknown>

export interface UnoGridClan {
	id: string
	name: string | null
	faction: string | null
	place: number | null
	score: number | null
	share: number | null
	sleeves: number | null
	tied: boolean | null
}

export interface UnoGridMatch {
	number: number
	map: string | null
	status: string | null
	bracket: string | null
	winnerId: string | null
	clans: UnoGridClan[]
}

export interface UnoGridStage {
	number: number
	time: string | null
	state: number | null
	matches: UnoGridMatch[]
}

export interface UnoGridGroup {
	number: number
	winner: UnoGridClan | null
	status: string | null
	tier: string | null
	tierMax: string | null
	rankMin: number | null
	rankMax: number | null
	missingCards: number | null
	clans: UnoGridClan[]
	stages: UnoGridStage[]
}

export interface UnoGridEvent {
	grid: {
		id: string
		mode: string | null
		date: string | null
		time: string | null
		number: number | null
		groupsCount: number | null
		observedAt: string | null
	}
	coverage: {
		complete: boolean
		expectedGroups: number | null
		downloadedGroups: number | null
		missingGroups: number[]
	} | null
	groups: UnoGridGroup[]
}

const MODE_BY_ID: Record<number, string> = {
	0: 'brawl',
	1: 'tournament',
	2: 'base_capture',
}

const RANKS = ['S', 'A', 'B', 'C', 'D', 'E'] as const

const asRecord = (value: unknown): RecordValue | null =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as RecordValue)
		: null

const asString = (value: unknown): string | null => {
	if (typeof value === 'string' && value.length > 0) return value
	if (typeof value === 'number' && Number.isFinite(value))
		return String(value)
	return null
}

const asNumber = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null

const asBoolean = (value: unknown): boolean | null =>
	typeof value === 'boolean' ? value : null

const asArray = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : []

const first = (record: RecordValue, keys: string[]): unknown => {
	for (const key of keys) {
		if (record[key] !== undefined && record[key] !== null)
			return record[key]
	}
	return null
}

const numberFrom = (record: RecordValue, keys: string[]) =>
	asNumber(first(record, keys))

const stringFrom = (record: RecordValue, keys: string[]) =>
	asString(first(record, keys))

function iconFaction(icon: unknown): string | null {
	const record = asRecord(icon)
	if (!record) return null
	return stringFrom(record, ['key', 'icon', 'alliance_id'])
}

function identity(value: unknown): UnoGridClan | null {
	const record = asRecord(value)
	if (!record) return null
	const id = stringFrom(record, ['id', 'uuid'])
	if (!id) return null
	return {
		id,
		name: stringFrom(record, ['name']),
		faction:
			stringFrom(record, ['faction', 'alliance_id']) ??
			iconFaction(record.icon),
		place: null,
		score: null,
		share: null,
		sleeves: null,
		tied: null,
	}
}

function collectIdentities(payload: RecordValue): Map<string, UnoGridClan> {
	const identities = new Map<string, UnoGridClan>()
	const remember = (value: unknown) => {
		const clan = identity(value)
		if (clan && !identities.has(clan.id)) identities.set(clan.id, clan)
	}

	for (const groupValue of asArray(payload.groups)) {
		const group = asRecord(groupValue)
		if (!group) continue
		remember(group.winner)
		for (const standingValue of asArray(group.standings)) {
			remember(asRecord(standingValue)?.clan)
		}
		for (const stageValue of asArray(group.stages)) {
			const stage = asRecord(stageValue)
			if (!stage) continue
			for (const matchValue of asArray(stage.matches)) {
				const match = asRecord(matchValue)
				if (!match) continue
				remember(match.winner)
				for (const actorValue of asArray(match.clans)) {
					remember(asRecord(actorValue)?.clan)
				}
			}
		}
	}

	for (const nodeValue of asArray(payload.nodes)) {
		const node = asRecord(nodeValue)
		const item = asRecord(node?.item)
		const data = asRecord(item?.data)
		remember(asRecord(data?.winner_data))
	}

	return identities
}

function cloneClan(
	clan: UnoGridClan,
	overrides: Partial<UnoGridClan> = {}
): UnoGridClan {
	return { ...clan, ...overrides }
}

function resolveClan(
	value: unknown,
	identities: Map<string, UnoGridClan>
): UnoGridClan | null {
	const base = identity(value)
	if (!base) return null
	return identities.get(base.id) ?? base
}

function groupClans(
	group: RecordValue,
	node: RecordValue | null,
	identities: Map<string, UnoGridClan>
): UnoGridClan[] {
	const clans = new Map<string, UnoGridClan>()
	const scores = new Map<string, number>()

	for (const standingValue of asArray(group.standings)) {
		const standing = asRecord(standingValue)
		const clan = resolveClan(standing?.clan, identities)
		if (!standing || !clan) continue
		clans.set(
			clan.id,
			cloneClan(clan, {
				place: numberFrom(standing, ['place']),
				share: numberFrom(standing, ['share_sum']),
				sleeves: numberFrom(standing, ['calculated_sleeves']),
				tied: asBoolean(standing.tied),
			})
		)
	}

	for (const stageValue of asArray(group.stages)) {
		const stage = asRecord(stageValue)
		if (!stage) continue
		for (const matchValue of asArray(stage.matches)) {
			const match = asRecord(matchValue)
			if (!match) continue
			for (const actorValue of asArray(match.clans)) {
				const actor = asRecord(actorValue)
				const clan = resolveClan(actor?.clan, identities)
				if (!actor || !clan) continue
				const score = numberFrom(actor, ['score'])
				if (score !== null)
					scores.set(clan.id, (scores.get(clan.id) ?? 0) + score)
				if (!clans.has(clan.id)) clans.set(clan.id, clan)
			}
		}
	}

	const participants =
		asArray(node?.clans).length > 0
			? asArray(node?.clans)
			: asArray(asRecord(group.metadata)?.clans)
	for (const participant of participants) {
		const id = asString(participant)
		if (!id || clans.has(id)) continue
		const known = identities.get(id)
		clans.set(
			id,
			known ?? {
				id,
				name: null,
				faction: null,
				place: null,
				score: null,
				share: null,
				sleeves: null,
				tied: null,
			}
		)
	}

	for (const clan of clans.values()) {
		const score = scores.get(clan.id)
		if (score !== undefined) clan.score = score
	}

	return [...clans.values()].sort((left, right) => {
		if (left.place !== null && right.place !== null)
			return left.place - right.place
		if (left.place !== null) return -1
		if (right.place !== null) return 1
		if (left.score !== null && right.score !== null)
			return right.score - left.score
		return left.name?.localeCompare(right.name ?? '') ?? 0
	})
}

function formatDate(time: string | null, timezone: string): string | null {
	if (!time) return null
	const parsed = new Date(time)
	if (Number.isNaN(parsed.getTime())) return time.slice(0, 10)
	try {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(parsed)
	} catch {
		return time.slice(0, 10)
	}
}

function compactMatch(
	value: unknown,
	identities: Map<string, UnoGridClan>
): UnoGridMatch | null {
	const match = asRecord(value)
	if (!match) return null
	const number = numberFrom(match, ['number'])
	if (number === null) return null
	const actors = asArray(match.clans)
	const clans = actors.flatMap((actorValue) => {
		const actor = asRecord(actorValue)
		const clan = resolveClan(actor?.clan, identities)
		if (!actor || !clan) return []
		return [cloneClan(clan, { score: numberFrom(actor, ['score']) })]
	})
	const firstActor = asRecord(actors[0])
	const reward = asRecord(firstActor?.calculated_reward)
	const flags = asArray(match.flags)
	return {
		number,
		map: stringFrom(match, ['map_id', 'text']),
		status:
			flags.length === 0
				? null
				: flags[0] === true
					? 'completed'
					: 'live',
		bracket: stringFrom(reward ?? {}, ['bracket']),
		winnerId: stringFrom(asRecord(match.winner) ?? {}, ['id']),
		clans,
	}
}

function compactStage(
	value: unknown,
	identities: Map<string, UnoGridClan>
): UnoGridStage | null {
	const stage = asRecord(value)
	if (!stage) return null
	const number = numberFrom(stage, ['number'])
	if (number === null) return null
	return {
		number,
		time: stringFrom(stage, ['time']),
		state: numberFrom(stage, ['state']),
		matches: asArray(stage.matches)
			.map((match) => compactMatch(match, identities))
			.filter((match): match is UnoGridMatch => match !== null)
			.sort((left, right) => left.number - right.number),
	}
}

function compactGroup(
	groupValue: unknown,
	nodeValue: unknown,
	identities: Map<string, UnoGridClan>
): UnoGridGroup | null {
	const group = asRecord(groupValue)
	if (!group) return null
	const node = asRecord(nodeValue)
	const number =
		numberFrom(group, ['group', 'number']) ??
		numberFrom(node ?? {}, ['number'])
	if (number === null) return null
	const clans = groupClans(group, node, identities)
	const winner = resolveClan(group.winner, identities) ?? clans[0] ?? null
	const rankRange = asRecord(node?.rank_range)
	const indices = asArray(rankRange?.indices)
		.map(asNumber)
		.filter((value): value is number => value !== null)
	const bestIndex = indices.length > 0 ? Math.min(...indices) : null
	const worstIndex = indices.length > 0 ? Math.max(...indices) : null
	return {
		number,
		winner,
		status: stringFrom(group, ['standings_status']),
		tier: bestIndex === null ? null : (RANKS[bestIndex] ?? null),
		tierMax: worstIndex === null ? null : (RANKS[worstIndex] ?? null),
		rankMin: asNumber(rankRange?.rating_min),
		rankMax: asNumber(rankRange?.rating_max),
		missingCards: asNumber(rankRange?.missing_cards),
		clans,
		stages: asArray(group.stages)
			.map((stage) => compactStage(stage, identities))
			.filter((stage): stage is UnoGridStage => stage !== null)
			.sort((left, right) => left.number - right.number),
	}
}

export function compactGridEvent(
	detail: unknown,
	exported: unknown,
	timezone = 'Europe/Minsk'
): UnoGridEvent {
	const detailRecord = asRecord(detail) ?? {}
	const exportedRecord = asRecord(exported) ?? {}
	const rawGrid =
		asRecord(detailRecord.grid) ?? asRecord(exportedRecord.grid) ?? {}
	const identities = collectIdentities(exportedRecord)

	const nodes = new Map<number, RecordValue>()
	for (const nodeValue of [
		...asArray(detailRecord.groups),
		...asArray(exportedRecord.nodes),
	]) {
		const node = asRecord(nodeValue)
		const number = asNumber(node?.number)
		if (node && number !== null && !nodes.has(number))
			nodes.set(number, node)
	}

	const groups = asArray(exportedRecord.groups)
		.map((groupValue) => {
			const group = asRecord(groupValue)
			const number = numberFrom(group ?? {}, ['group', 'number']) ?? null
			return compactGroup(
				groupValue,
				number === null ? null : nodes.get(number),
				identities
			)
		})
		.filter((group): group is UnoGridGroup => group !== null)
		.sort((left, right) => left.number - right.number)

	const rawMode = rawGrid.mode
	const mode =
		typeof rawMode === 'string'
			? rawMode
			: (MODE_BY_ID[asNumber(rawMode) ?? -1] ??
				MODE_BY_ID[numberFrom(rawGrid, ['mode_id']) ?? -1] ??
				null)
	const time = stringFrom(rawGrid, ['time'])
	const coverage = asRecord(exportedRecord.coverage)

	return {
		grid: {
			id:
				stringFrom(rawGrid, ['id', 'grid_id', 'uuid']) ??
				stringFrom(detailRecord, ['id']) ??
				'',
			mode,
			date: formatDate(time, timezone),
			time,
			number: numberFrom(rawGrid, ['number']),
			groupsCount:
				numberFrom(rawGrid, ['groups_count', 'number']) ??
				groups.length,
			observedAt: stringFrom(rawGrid, ['observed_at']),
		},
		coverage: coverage
			? {
					complete: coverage.complete === true,
					expectedGroups: numberFrom(coverage, ['expected_groups']),
					downloadedGroups: numberFrom(coverage, [
						'downloaded_groups',
					]),
					missingGroups: asArray(coverage.missing_group_results)
						.map(asNumber)
						.filter((value): value is number => value !== null),
				}
			: null,
		groups,
	}
}
