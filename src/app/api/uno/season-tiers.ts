import { redis } from 'bun'
import type {
	UnoSeasonSubtier,
	UnoSeasonTier,
	UnoSeasonTierClan,
	UnoSeasonTiersResponse,
} from '@/types/uno.type'
import { unoService } from './service'

const RANKS = ['S', 'A', 'B', 'C', 'D'] as const

const PAGE_SIZE = 100

const MAX_SUBTIERS = 6
const MIN_SUBTIERS = 2
const TARGET_SUBTIER_SIZE = 7
const MIN_CLANS_PER_RANK = 5
const MAX_CLANS_PER_RANK = 20
const TOP_CLANS_RATIO = 0.1

const CACHE_VERSION = 'v3'
const CACHE_TTL_CURRENT = 60 * 15
const CACHE_TTL_HISTORICAL = 60 * 60 * 24
const SEASONS_CACHE_KEY = 'uno:seasons:v1'
const SEASONS_CACHE_TTL = 60 * 60

interface LeaderboardItem {
	id?: string
	name?: string
	tag?: string | null
	faction?: string | null
	rating?: number | null
	position?: number | null
	season_position?: number | null
	flag?: boolean | null
	member_count_current?: number | null
	rank?: string | null
}

interface LeaderboardResponse {
	items?: LeaderboardItem[]
	total?: number | null
	observed_at?: string | null
	rating_rules_version?: string | null
}

interface SeasonResponse {
	items?: Array<{ id?: string; period?: string[] }>
}

const cacheKey = (season: string) =>
	`uno:season-tiers:${CACHE_VERSION}:${season}`

const asNumber = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null

const asString = (value: unknown): string | null =>
	typeof value === 'string' && value.length > 0 ? value : null

const asBoolean = (value: unknown): boolean | null =>
	typeof value === 'boolean' ? value : null

function toClan(item: LeaderboardItem): UnoSeasonTierClan {
	return {
		id: asString(item.id) ?? '',
		name: asString(item.name) ?? '—',
		tag: asString(item.tag),
		faction: asString(item.faction),
		rating: asNumber(item.rating),
		position: asNumber(item.position),
		seasonPosition: asNumber(item.season_position),
		flag: asBoolean(item.flag),
		memberCount: asNumber(item.member_count_current),
	}
}

async function fetchRankClans(
	season: string,
	rank: string
): Promise<UnoSeasonTierClan[]> {
	const clans: UnoSeasonTierClan[] = []
	let offset = 0
	let total: number | null = null

	while (true) {
		const page = await unoService.request<LeaderboardResponse>(
			'/leaderboard',
			{ season, rank, limit: PAGE_SIZE, offset }
		)
		const items = page.items ?? []

		if (total === null) total = asNumber(page.total)
		clans.push(...items.map(toClan))

		offset += PAGE_SIZE
		if (items.length < PAGE_SIZE) break
		if (total !== null && offset >= total) break
	}

	clans.sort(
		(left, right) =>
			(left.position ?? Number.MAX_SAFE_INTEGER) -
			(right.position ?? Number.MAX_SAFE_INTEGER)
	)

	return clans.slice(0, resolveClanLimit(clans.length))
}

function resolveClanLimit(count: number): number {
	const proportional = Math.ceil(count * TOP_CLANS_RATIO)
	return Math.min(
		count,
		MAX_CLANS_PER_RANK,
		Math.max(MIN_CLANS_PER_RANK, proportional)
	)
}

function resolveSubtierCount(count: number): number {
	if (count <= 1) return Math.max(count, 1)

	const target = Math.ceil(count / TARGET_SUBTIER_SIZE)
	return Math.min(MAX_SUBTIERS, Math.max(MIN_SUBTIERS, target))
}

function buildSubtiers(
	rank: string,
	clans: UnoSeasonTierClan[]
): UnoSeasonSubtier[] {
	if (clans.length === 0) return []

	const groups = resolveSubtierCount(clans.length)
	const base = Math.floor(clans.length / groups)
	const extra = clans.length % groups

	const subtiers: UnoSeasonSubtier[] = []
	let cursor = 0

	for (let level = 1; level <= groups; level += 1) {
		const size = base + (level <= extra ? 1 : 0)
		const slice = clans.slice(cursor, cursor + size)
		cursor += size

		const ratings = slice
			.map((clan) => clan.rating)
			.filter((rating): rating is number => rating !== null)

		subtiers.push({
			level,
			label: `${rank}${level}`,
			fromPosition: slice[0]?.position ?? null,
			toPosition: slice[slice.length - 1]?.position ?? null,
			ratingMax: ratings.length > 0 ? Math.max(...ratings) : null,
			ratingMin: ratings.length > 0 ? Math.min(...ratings) : null,
			clans: slice,
		})
	}

	return subtiers
}

async function loadSeasons(): Promise<
	Array<{ id?: string; period?: string[] }>
> {
	try {
		const cached = await redis.get(SEASONS_CACHE_KEY)
		if (cached) return JSON.parse(cached)
	} catch (error) {
		console.error('[uno] failed to read seasons cache:', error)
	}

	const response = await unoService.request<SeasonResponse>('/seasons')
	const items = response.items ?? []

	try {
		await redis.set(
			SEASONS_CACHE_KEY,
			JSON.stringify(items),
			'EX',
			SEASONS_CACHE_TTL
		)
	} catch (error) {
		console.error('[uno] failed to write seasons cache:', error)
	}

	return items
}

async function resolveCacheTtl(season: string): Promise<number> {
	try {
		const seasons = await loadSeasons()
		const match = seasons.find((entry) => entry.id === season)
		const end = match?.period?.[1]
		if (end) {
			const endedAt = Date.parse(end)
			if (Number.isFinite(endedAt) && endedAt < Date.now()) {
				return CACHE_TTL_HISTORICAL
			}
		}
	} catch (error) {
		console.error('[uno] failed to resolve season end:', error)
	}

	return CACHE_TTL_CURRENT
}

async function buildSeasonTiers(
	season: string
): Promise<UnoSeasonTiersResponse> {
	const [meta, ...rankResults] = await Promise.all([
		unoService.request<LeaderboardResponse>('/leaderboard', {
			season,
			limit: 1,
		}),
		...RANKS.map((rank) => fetchRankClans(season, rank)),
	])

	const tiers: UnoSeasonTier[] = RANKS.map((rank, index) => {
		const clans = rankResults[index]
		return {
			rank,
			count: clans.length,
			subtiers: buildSubtiers(rank, clans),
		}
	})

	return {
		season,
		total: asNumber(meta.total),
		observedAt: asString(meta.observed_at),
		ratingRulesVersion: asString(meta.rating_rules_version),
		tiers,
	}
}

const inflight = new Map<string, Promise<UnoSeasonTiersResponse>>()

async function readCache(key: string): Promise<UnoSeasonTiersResponse | null> {
	try {
		const cached = await redis.get(key)
		return cached ? (JSON.parse(cached) as UnoSeasonTiersResponse) : null
	} catch (error) {
		console.error('[uno] failed to read season tiers cache:', error)
		return null
	}
}

async function writeCache(
	key: string,
	value: UnoSeasonTiersResponse
): Promise<void> {
	try {
		const ttl = await resolveCacheTtl(value.season)
		await redis.set(key, JSON.stringify(value), 'EX', ttl)
	} catch (error) {
		console.error('[uno] failed to write season tiers cache:', error)
	}
}

export async function getSeasonTiers(
	season: string
): Promise<UnoSeasonTiersResponse> {
	const key = cacheKey(season)

	const cached = await readCache(key)
	if (cached) return cached

	const existing = inflight.get(key)
	if (existing) return existing

	const promise = buildSeasonTiers(season)
		.then(async (response) => {
			await writeCache(key, response)
			return response
		})
		.finally(() => inflight.delete(key))

	inflight.set(key, promise)
	return promise
}
