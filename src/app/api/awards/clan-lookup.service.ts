import { redis } from 'bun'
import { UnoApiError, unoService } from '@/app/api/uno/service'
import { prisma } from '@/lib/prisma'

export interface VerifiedClan {
	id: string
	name: string
	tag: string
	leader: string
	level: number
	alliance: string
	member_count: number
}

export class ClanLookupError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly extra?: Record<string, unknown>
	) {
		super(code)
	}
}

type ClanRecord = {
	id?: unknown
	name?: unknown
	tag?: unknown
	leader?: unknown
	level?: unknown
	level_raw?: unknown
	alliance?: unknown
	faction?: unknown
	member_count?: unknown
	members_count?: unknown
}

function mapClan(raw: ClanRecord): VerifiedClan | null {
	if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
	return {
		id: raw.id,
		name: raw.name,
		tag: typeof raw.tag === 'string' ? raw.tag : '',
		leader: typeof raw.leader === 'string' ? raw.leader : '',
		level: Number(raw.level_raw ?? raw.level ?? 0),
		alliance:
			typeof raw.faction === 'string'
				? raw.faction
				: typeof raw.alliance === 'string'
					? raw.alliance
					: '',
		member_count: Number(raw.member_count ?? raw.members_count ?? 0),
	}
}

function exactMatches(value: unknown, normalized: string): VerifiedClan[] {
	const rows = Array.isArray(value)
		? value
		: typeof value === 'object' && value !== null && 'items' in value
			? (value as { items?: unknown }).items
			: []
	if (!Array.isArray(rows)) return []
	const result = rows
		.map((row) =>
			row && typeof row === 'object' ? mapClan(row as ClanRecord) : null
		)
		.filter((row): row is VerifiedClan => row !== null)
		.filter(
			(row) =>
				row.name.toLocaleLowerCase() === normalized.toLocaleLowerCase()
		)
	return [...new Map(result.map((row) => [row.id, row])).values()]
}

async function localLookup(normalized: string): Promise<VerifiedClan[]> {
	const rows = await prisma.clan.findMany({
		where: { name: { equals: normalized, mode: 'insensitive' } },
		select: {
			id: true,
			name: true,
			tag: true,
			leader: true,
			level: true,
			alliance: true,
			member_count: true,
		},
	})
	return rows.map((row) => ({ ...row }))
}

export async function lookupClan(input: string): Promise<VerifiedClan> {
	const normalized = input.trim().replace(/\s+/g, ' ')
	if (!normalized) throw new ClanLookupError(404, 'clan_not_found')
	const cacheKey = `awards:clan-search:${normalized.toLocaleLowerCase()}`
	const cached = await redis.get(cacheKey)
	let matches: VerifiedClan[] = cached
		? (JSON.parse(cached) as VerifiedClan[])
		: []
	if (!cached) {
		try {
			const response = await unoService.request<unknown>('/clans', {
				q: normalized,
				limit: 100,
			})
			matches = exactMatches(response, normalized)
			await redis.set(cacheKey, JSON.stringify(matches), 'EX', 300)
		} catch (error) {
			const fallback =
				error instanceof UnoApiError &&
				[429, 502, 503, 504].includes(error.status)
					? await localLookup(normalized)
					: []
			if (fallback.length === 1) return fallback[0]
			throw new ClanLookupError(503, 'verification_unavailable')
		}
	}
	if (matches.length === 0) throw new ClanLookupError(404, 'clan_not_found')
	if (matches.length > 1)
		throw new ClanLookupError(422, 'clan_ambiguous', {
			candidates: matches.map(
				({ id, name, tag, alliance, member_count }) => ({
					id,
					name,
					tag,
					faction: alliance || null,
					member_count,
				})
			),
		})
	return matches[0]
}
