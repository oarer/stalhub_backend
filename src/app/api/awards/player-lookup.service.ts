import { scGateway } from '@/app/api/sc-gateway/gateway'
import { prisma } from '@/lib/prisma'
import { normalizePlayerName, normalizePlayerQuery } from './player-top'

export const PLAYER_REGION = 'RU'

const SEARCH_CANDIDATES_LIMIT = 500
const SEARCH_RESULTS_LIMIT = 10

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLIANCE_RE = /^[a-z_]{1,32}$/

export class PlayerLookupError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly extra?: Record<string, unknown>
	) {
		super(code)
	}
}

export interface ResolvedPlayer {
	uuid: string
	name: string
	alliance: string | null
	region: string
}

interface RawPlayerProfile {
	username?: unknown
	uuid?: unknown
	alliance?: unknown
}

function mapProfile(raw: unknown): ResolvedPlayer | null {
	if (!raw || typeof raw !== 'object') return null
	const value = raw as RawPlayerProfile
	if (typeof value.uuid !== 'string' || !UUID_RE.test(value.uuid)) return null
	if (typeof value.username !== 'string') return null
	const name = normalizePlayerName(value.username)
	if (!name) return null
	const alliance =
		typeof value.alliance === 'string' && ALLIANCE_RE.test(value.alliance)
			? value.alliance
			: null
	return { uuid: value.uuid, name, alliance, region: PLAYER_REGION }
}

function statusOf(error: unknown): number | null {
	if (!error || typeof error !== 'object' || !('status' in error))
		return null
	const status = Number((error as { status: unknown }).status)
	return Number.isFinite(status) ? status : null
}

export async function resolvePlayer(input: string): Promise<ResolvedPlayer> {
	const name = normalizePlayerName(input)
	if (!name) throw new PlayerLookupError(422, 'invalid_player_name')
	let raw: unknown
	try {
		raw = await scGateway.get<unknown>(
			`/${PLAYER_REGION}/character/by-name/${encodeURIComponent(name)}/profile`
		)
	} catch (error) {
		const status = statusOf(error)
		if (status === 404) throw new PlayerLookupError(404, 'player_not_found')
		if (status === 429) throw new PlayerLookupError(429, 'too_many_requests')
		throw new PlayerLookupError(503, 'verification_unavailable')
	}
	const player = mapProfile(raw)
	if (!player) throw new PlayerLookupError(404, 'player_not_found')
	return player
}

interface PlayerCandidate {
	name: string
	alliance: string | null
	region: string
	uuid: string | null
}

async function popularCandidates(): Promise<PlayerCandidate[]> {
	const [rows, blacklist] = await Promise.all([
		prisma.popularPlayer.findMany({
			where: { region: PLAYER_REGION },
			orderBy: { views: 'desc' },
			take: SEARCH_CANDIDATES_LIMIT,
			select: { uuid: true, username: true, alliance: true, region: true },
		}),
		prisma.playerBlacklist.findMany({ select: { uuid: true } }),
	])
	const blocked = new Set(blacklist.map((row) => row.uuid))
	return rows
		.filter((row) => !blocked.has(row.uuid))
		.map((row) => ({
			name: row.username,
			alliance: row.alliance || null,
			region: row.region,
			uuid: row.uuid,
		}))
}

async function authCandidates(): Promise<PlayerCandidate[]> {
	const rows = await prisma.eXBOAuth.findMany({
		where: {
			username: { not: '' },
			OR: [{ region: PLAYER_REGION }, { region: null }],
		},
		take: SEARCH_CANDIDATES_LIMIT,
		select: { username: true, region: true },
	})
	return rows.map((row) => ({
		name: row.username,
		alliance: null,
		region: row.region ?? PLAYER_REGION,
		uuid: null,
	}))
}

async function clanCandidates(): Promise<PlayerCandidate[]> {
	const rows = await prisma.clanMember.findMany({
		where: { clan: { region: PLAYER_REGION } },
		orderBy: { id: 'asc' },
		take: SEARCH_CANDIDATES_LIMIT,
		select: { name: true },
	})
	return rows.map((row) => ({
		name: row.name,
		alliance: null,
		region: PLAYER_REGION,
		uuid: null,
	}))
}

export async function searchPlayers(input: string): Promise<PlayerCandidate[]> {
	const query = normalizePlayerQuery(input)
	if (!query) throw new PlayerLookupError(422, 'invalid_query')
	const needle = query.toLocaleLowerCase()
	const sources = await Promise.all([
		popularCandidates(),
		authCandidates(),
		clanCandidates(),
	])
	const seen = new Set<string>()
	const matches: PlayerCandidate[] = []
	for (const candidate of sources.flat()) {
		const name = normalizePlayerName(candidate.name)
		if (!name) continue
		const key = name.toLocaleLowerCase()
		if (seen.has(key) || !key.includes(needle)) continue
		seen.add(key)
		matches.push({
			name,
			alliance: candidate.alliance,
			region: candidate.region,
			uuid: candidate.uuid,
		})
		if (matches.length >= SEARCH_RESULTS_LIMIT) break
	}
	return matches
}
