import { redis } from 'bun'
import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { ClanLookupError, lookupClan } from './clan-lookup.service'
import {
	PlayerLookupError,
	resolvePlayer,
	searchPlayers,
} from './player-lookup.service'
import { normalizePlayerName, topPlayerNominees } from './player-top'
import { normalizeSocialLinks } from './social-links'

export type Locale = 'ru' | 'en' | 'es' | 'fr' | 'ko'
export type AwardError = {
	status: number
	code: string
	extra?: Record<string, unknown>
}

const statusMap = {
	DRAFT: 'draft',
	VOTING: 'voting',
	ENDED: 'ended',
	PUBLISHED: 'published',
} as const
const kindMap = {
	NOMINEES: 'nominees',
	UPDATES: 'updates',
	CLAN: 'clan',
	PLAYER: 'player',
} as const
const TOP_PLAYERS_LIMIT = 10
const campaignSelect = {
	id: true,
	year: true,
	title: true,
	status: true,
	ends_at: true,
	results_published_at: true,
	categories: {
		orderBy: { position: 'asc' },
		select: {
			id: true,
			slug: true,
			title_i18n: true,
			description_i18n: true,
			kind: true,
			image_url: true,
			nominees: {
				orderBy: { position: 'asc' },
				select: {
					id: true,
					name: true,
					avatar_url: true,
					social_links: true,
					description_i18n: true,
					date: true,
					patch_url: true,
					clan_id: true,
					clan_name: true,
					clan_tag: true,
					clan_member_count: true,
					player_uuid: true,
					player_region: true,
					player_alliance: true,
					clan: { select: { alliance: true } },
				},
			},
		},
	},
} satisfies Prisma.AwardCampaignSelect

function localized(value: unknown, locale: Locale): string | null {
	if (!value || typeof value !== 'object') return null
	const record = value as Record<string, unknown>
	return typeof record[locale] === 'string'
		? (record[locale] as string)
		: typeof record.ru === 'string'
			? (record.ru as string)
			: null
}
function err(
	status: number,
	code: string,
	extra?: Record<string, unknown>
): AwardError {
	return { status, code, extra }
}
type Campaign = Prisma.AwardCampaignGetPayload<{
	select: typeof campaignSelect
}>
type Nominee = Campaign['categories'][number]['nominees'][number]
type Category = Campaign['categories'][number]

function publicNominee(row: Nominee, kind: string, locale: Locale) {
	const result: Record<string, unknown> = {
		id: row.id,
		name: row.name,
		avatar_url: row.avatar_url,
		social_links: normalizeSocialLinks(row.social_links),
		description: localized(row.description_i18n, locale),
	}
	if (kind === 'updates') {
		result.date = row.date
		result.patch_url = row.patch_url
	}
	if (kind === 'player')
		Object.assign(result, {
			player_uuid: row.player_uuid,
			player_region: row.player_region,
			player_alliance: row.player_alliance,
		})
	if (kind === 'clan')
		Object.assign(result, {
			clan_id: row.clan_id,
			clan_name: row.clan_name,
			clan_tag: row.clan_tag,
			clan_member_count: row.clan_member_count,
			clan_faction: row.clan?.alliance ?? null,
		})
	return result
}

function publicCategory(
	category: Category,
	kind: string,
	locale: Locale,
	myVoteId: string | null,
	votes: Map<string, number>
) {
	const nominees = category.nominees.map((row) =>
		publicNominee(row, kind, locale)
	)
	if (kind === 'player') {
		const ranked = category.nominees.map((row) => ({
			id: row.id,
			name: row.name,
			avatar_url: row.avatar_url,
			alliance: row.player_alliance,
			region: row.player_region,
			player_uuid: row.player_uuid,
			votes: votes.get(row.id) ?? 0,
		}))
		return {
			id: category.id,
			slug: category.slug,
			title: localized(category.title_i18n, locale),
			description: localized(category.description_i18n, locale),
			kind,
			image_url: category.image_url,
			my_vote_nominee_id: myVoteId,
			nominees,
			top: topPlayerNominees(ranked, TOP_PLAYERS_LIMIT).map((row) => ({
				id: row.id,
				name: row.name,
				avatar_url: row.avatar_url,
				alliance: row.alliance,
				region: row.region,
				player_uuid: row.player_uuid,
			})),
		}
	}
	return {
		id: category.id,
		slug: category.slug,
		title: localized(category.title_i18n, locale),
		description: localized(category.description_i18n, locale),
		kind,
		image_url: category.image_url,
		my_vote_nominee_id: myVoteId,
		nominees,
	}
}

async function latestCampaign() {
	return prisma.awardCampaign.findFirst({
		where: { status: { not: 'DRAFT' } },
		orderBy: { year: 'desc' },
		select: campaignSelect,
	})
}
async function voteIds(categoryIds: string[], userId?: number) {
	if (!userId || categoryIds.length === 0) return new Map<string, string>()
	const rows = await prisma.awardVote.findMany({
		where: { user_id: userId, category_id: { in: categoryIds } },
		select: { category_id: true, nominee_id: true },
	})
	return new Map(rows.map((row) => [row.category_id, row.nominee_id]))
}
async function activeVoteCounts(categoryIds: string[]) {
	const counts = new Map<string, number>()
	if (categoryIds.length === 0) return counts
	const rows = await prisma.awardVote.findMany({
		where: {
			category_id: { in: categoryIds },
			excluded_at: null,
		},
		select: { nominee_id: true },
	})
	for (const row of rows)
		counts.set(row.nominee_id, (counts.get(row.nominee_id) ?? 0) + 1)
	return counts
}
function displayStatus(status: keyof typeof statusMap, endsAt: Date | null) {
	if (status === 'VOTING' && endsAt && endsAt <= new Date()) return 'ended'
	return statusMap[status]
}
function blockReason(
	status: keyof typeof statusMap,
	hasExbo: boolean | undefined,
	endsAt: Date | null
): string | null {
	if (status !== 'VOTING')
		return status === 'ENDED' || status === 'PUBLISHED'
			? 'ended'
			: 'not_voting'
	if (endsAt && endsAt <= new Date()) return 'ended'
	if (hasExbo === false) return 'not_exbo'
	if (hasExbo === undefined) return 'not_authenticated'
	return null
}

export async function getAwards(
	locale: Locale,
	userId?: number,
	hasExbo?: boolean
) {
	const campaign = await latestCampaign()
	if (!campaign) throw err(404, 'not_found')
	const playerCategoryIds = campaign.categories
		.filter((category) => category.kind === 'PLAYER')
		.map((category) => category.id)
	const [votes, playerVotes] = await Promise.all([
		voteIds(campaign.categories.map((c) => c.id), userId),
		activeVoteCounts(playerCategoryIds),
	])
	const status = displayStatus(campaign.status, campaign.ends_at)
	return {
		year: campaign.year,
		title: campaign.title,
		status,
		ends_at: campaign.ends_at?.toISOString() ?? null,
		server_time: new Date().toISOString(),
		can_vote:
			blockReason(campaign.status, hasExbo, campaign.ends_at) === null,
		vote_block_reason: blockReason(
			campaign.status,
			hasExbo,
			campaign.ends_at
		),
		categories: campaign.categories.map((category) =>
			publicCategory(
				category,
				kindMap[category.kind],
				locale,
				votes.get(category.id) ?? null,
				playerVotes
			)
		),
	}
}

export async function getCategory(
	year: number,
	slug: string,
	locale: Locale,
	userId?: number,
	hasExbo?: boolean
) {
	const campaign = await prisma.awardCampaign.findUnique({
		where: { year },
		select: campaignSelect,
	})
	if (!campaign || campaign.status === 'DRAFT') throw err(404, 'not_found')
	const category = campaign.categories.find((item) => item.slug === slug)
	if (!category) throw err(404, 'not_found')
	const [votes, playerVotes] = await Promise.all([
		voteIds([category.id], userId),
		category.kind === 'PLAYER'
			? activeVoteCounts([category.id])
			: Promise.resolve(new Map<string, number>()),
	])
	const reason = blockReason(campaign.status, hasExbo, campaign.ends_at)
	return {
		year: campaign.year,
		title: campaign.title,
		status: displayStatus(campaign.status, campaign.ends_at),
		ends_at: campaign.ends_at?.toISOString() ?? null,
		server_time: new Date().toISOString(),
		can_vote: reason === null,
		vote_block_reason: reason,
		categories: [
			publicCategory(
				category,
				kindMap[category.kind],
				locale,
				votes.get(category.id) ?? null,
				playerVotes
			),
		],
	}
}

function snapshotPlayerTop(category: Record<string, unknown>) {
	const kind =
		typeof category.kind === 'string' ? category.kind.toLowerCase() : ''
	if (kind !== 'player') return null
	const rows = (
		(category.nominees ?? []) as Array<Record<string, unknown>>
	).map((nominee, index) => ({
		id: String(nominee.id ?? index),
		name: nominee.name,
		avatar_url: nominee.avatar_url,
		alliance: nominee.player_alliance,
		region: nominee.player_region,
		player_uuid: nominee.player_uuid,
		votes: Number(nominee.votes_count ?? 0),
	}))
	return topPlayerNominees(rows, TOP_PLAYERS_LIMIT).map((row) => ({
		id: row.id,
		name: row.name,
		avatar_url: row.avatar_url,
		alliance: row.alliance,
		region: row.region,
		player_uuid: row.player_uuid,
	}))
}

export async function getResults(locale: Locale) {
	const campaign = await prisma.awardCampaign.findFirst({
		where: { status: 'PUBLISHED' },
		orderBy: { year: 'desc' },
		select: {
			year: true,
			title: true,
			status: true,
			results_published_at: true,
			results_snapshot: true,
		},
	})
	if (
		!campaign ||
		campaign.status !== 'PUBLISHED' ||
		!campaign.results_snapshot
	)
		throw err(404, 'not_published')
	const snapshot = campaign.results_snapshot as {
		categories?: Array<Record<string, unknown>>
	}
	const snapshotCategories = snapshot.categories ?? []
	const clanIds = [
		...new Set(
			snapshotCategories.flatMap((category) =>
				((category.nominees ?? []) as Array<Record<string, unknown>>)
					.map((nominee) => nominee.clan_id)
					.filter((id): id is string => typeof id === 'string')
			)
		),
	]
	const clans = clanIds.length
		? await prisma.clan.findMany({
				where: { id: { in: clanIds } },
				select: { id: true, alliance: true },
			})
		: []
	const factionByClan = new Map(clans.map((clan) => [clan.id, clan.alliance]))
	return {
		year: campaign.year,
		title: campaign.title,
		published_at: campaign.results_published_at?.toISOString() ?? null,
		categories: snapshotCategories.map((category) => ({
			id: category.id,
			slug: category.slug,
			title: localized(category.title_i18n, locale) ?? category.title,
			description:
				localized(category.description_i18n, locale) ??
				category.description,
			kind:
				typeof category.kind === 'string'
					? category.kind.toLowerCase()
					: category.kind,
			image_url: category.image_url ?? null,
			winner_ids: category.winner_ids,
				top: snapshotPlayerTop(category),
			nominees: (
				(category.nominees ?? []) as Array<Record<string, unknown>>
			).map((n) => ({
				id: n.id,
				name: n.name,
				avatar_url: n.avatar_url,
				date: n.date,
				patch_url: n.patch_url,
				social_links: normalizeSocialLinks(n.social_links),
				description: localized(n.description_i18n, locale),
				clan_id: n.clan_id,
				clan_name: n.clan_name,
				clan_tag: n.clan_tag,
				clan_member_count: n.clan_member_count,
				player_uuid: n.player_uuid,
				player_region: n.player_region,
				player_alliance: n.player_alliance,
				clan_faction:
					(typeof n.clan_faction === 'string'
						? n.clan_faction
						: typeof n.clan_id === 'string'
							? factionByClan.get(n.clan_id)
							: null) ?? null,
				votes_count: n.votes_count,
				place: n.place,
			})),
		})),
	}
}

async function currentCategory(categoryId: string) {
	const category = await prisma.awardCategory.findUnique({
		where: { id: categoryId },
		select: {
			id: true,
			kind: true,
			campaign: { select: { id: true, status: true, ends_at: true } },
		},
	})
	return category
}
export async function vote(
	userId: number,
	categoryId: string,
	nomineeId: string
) {
	const category = await currentCategory(categoryId)
	if (!category) throw err(422, 'invalid_category')
	if (category.campaign.status !== 'VOTING') throw err(422, 'not_voting')
	if (category.campaign.ends_at && category.campaign.ends_at <= new Date())
		throw err(422, 'ended')
	const nominee = await prisma.awardNominee.findFirst({
		where: { id: nomineeId, category_id: categoryId },
		select: { id: true },
	})
	if (!nominee) throw err(422, 'invalid_nominee')
	try {
		await prisma.awardVote.create({
			data: {
				category_id: categoryId,
				nominee_id: nomineeId,
				user_id: userId,
			},
			select: { id: true },
		})
	} catch (error) {
		if ((error as { code?: string }).code === 'P2002')
			throw err(409, 'already_voted')
		throw error
	}
}

export async function nominate(
	userId: number,
	categoryId: string,
	clanName: string
) {
	const normalized = clanName.trim().replace(/\s+/g, ' ')
	const category = await prisma.awardCategory.findUnique({
		where: { id: categoryId },
		select: {
			id: true,
			kind: true,
			campaign: { select: { id: true, status: true, ends_at: true } },
		},
	})
	if (!category || category.kind !== 'CLAN')
		throw err(422, 'invalid_category')
	if (category.campaign.status !== 'VOTING') throw err(422, 'not_voting')
	if (category.campaign.ends_at && category.campaign.ends_at <= new Date())
		throw err(422, 'ended')
	const total = await prisma.awardNominee.count({
		where: {
			nominated_by: userId,
			category: { campaign_id: category.campaign.id },
		},
	})
	if (total >= 1) throw err(429, 'too_many_requests')
	if (
		(await prisma.awardNominee.count({
			where: { category_id: categoryId },
		})) >= 20
	)
		throw err(400, 'category_cap_exceeded')
	const cooldown = `awards:nominate:${userId}`
	if (!(await redis.set(cooldown, '1', 'NX', 'EX', '15')))
		throw err(429, 'cooldown', { cooldown_seconds: 15 })
	let clan: Awaited<ReturnType<typeof lookupClan>>
	try {
		clan = await lookupClan(normalized)
	} catch (error) {
		if (error instanceof ClanLookupError)
			throw err(error.status, error.code, error.extra)
		throw error
	}
	await prisma.clan.upsert({
		where: { id: clan.id },
		create: {
			id: clan.id,
			name: clan.name,
			tag: clan.tag,
			leader: clan.leader,
			level: clan.level,
			alliance: clan.alliance,
			member_count: clan.member_count,
			status: 'FROZEN',
			region: 'RU',
		},
		update: {},
		select: { id: true },
	})
	const position = await prisma.awardNominee.count({
		where: { category_id: categoryId },
	})
	try {
		const nominee = await prisma.awardNominee.create({
			data: {
				category_id: categoryId,
				clan_id: clan.id,
				clan_name: clan.name,
				clan_tag: clan.tag,
				clan_member_count: clan.member_count,
				nominated_by: userId,
				name: clan.name,
				position,
			},
			select: {
				id: true,
				category_id: true,
				clan_id: true,
				clan_name: true,
				clan_tag: true,
				created_at: true,
			},
		})
		return nominee
	} catch (error) {
		if ((error as { code?: string }).code === 'P2002')
			throw err(409, 'already_nominated')
		throw error
	}
}

const PLAYER_CATEGORY_CAP = 200

function playerNameKey(name: string) {
	return name.toLocaleLowerCase()
}

async function playerVoteTarget(categoryId: string, playerName: string) {
	const name = normalizePlayerName(playerName)
	if (!name) throw err(422, 'invalid_player_name')
	let player: Awaited<ReturnType<typeof resolvePlayer>>
	try {
		player = await resolvePlayer(name)
	} catch (error) {
		if (error instanceof PlayerLookupError)
			throw err(error.status, error.code, error.extra)
		throw error
	}

	const existing = await prisma.awardNominee.findUnique({
		where: {
			category_id_player_uuid: {
				category_id: categoryId,
				player_uuid: player.uuid,
			},
		},
		select: { id: true, name: true, avatar_url: true },
	})
	if (existing) {
		if (existing.name !== player.name || existing.avatar_url)
			await prisma.awardNominee.update({
				where: { id: existing.id },
				data: { name: player.name, player_alliance: player.alliance },
				select: { id: true },
			})
		return existing
	}

	const sameName = await prisma.awardNominee.findFirst({
		where: {
			category_id: categoryId,
			player_uuid: null,
			name: { equals: player.name, mode: 'insensitive' },
		},
		select: { id: true, nominated_by: true },
	})
	if (sameName) {
		if (sameName.nominated_by === null)
			await prisma.awardNominee.update({
				where: { id: sameName.id },
				data: {
					player_uuid: player.uuid,
					player_region: player.region,
					player_alliance: player.alliance,
				},
				select: { id: true },
			})
		return sameName
	}

	if (
		(await prisma.awardNominee.count({
			where: { category_id: categoryId },
		})) >= PLAYER_CATEGORY_CAP
	)
		throw err(400, 'category_cap_exceeded')

	const position = await prisma.awardNominee.count({
		where: { category_id: categoryId },
	})
	try {
		return await prisma.awardNominee.create({
			data: {
				category_id: categoryId,
				name: player.name,
				player_uuid: player.uuid,
				player_region: player.region,
				player_alliance: player.alliance,
				position,
			},
			select: { id: true, name: true, avatar_url: true },
		})
	} catch (error) {
		if ((error as { code?: string }).code === 'P2002') {
			const row = await prisma.awardNominee.findUnique({
				where: {
					category_id_player_uuid: {
						category_id: categoryId,
						player_uuid: player.uuid,
					},
				},
				select: { id: true, name: true, avatar_url: true },
			})
			if (row) return row
		}
		throw error
	}
}

export async function voteForPlayer(
	userId: number,
	categoryId: string,
	playerName: string
) {
	const category = await currentCategory(categoryId)
	if (!category) throw err(422, 'invalid_category')
	if (category.kind !== 'PLAYER') throw err(422, 'invalid_category')
	if (category.campaign.status !== 'VOTING') throw err(422, 'not_voting')
	if (category.campaign.ends_at && category.campaign.ends_at <= new Date())
		throw err(422, 'ended')
	const nominee = await playerVoteTarget(categoryId, playerName)
	try {
		await prisma.awardVote.create({
			data: {
				category_id: categoryId,
				nominee_id: nominee.id,
				user_id: userId,
			},
			select: { id: true },
		})
	} catch (error) {
		if ((error as { code?: string }).code === 'P2002')
			throw err(409, 'already_voted')
		throw error
	}
	return nominee
}

export async function searchAwardPlayers(
	categoryId: string,
	query: string
) {
	const category = await prisma.awardCategory.findUnique({
		where: { id: categoryId },
		select: { id: true, kind: true, slug: true, campaign_id: true },
	})
	if (!category || category.kind !== 'PLAYER')
		throw err(422, 'invalid_category')
	let candidates: Awaited<ReturnType<typeof searchPlayers>> = []
	try {
		candidates = await searchPlayers(query)
	} catch (error) {
		if (!(error instanceof PlayerLookupError)) throw error
	}
	try {
		const exact = await resolvePlayer(query)
		if (
			!candidates.some(
				(candidate) =>
					candidate.name.toLocaleLowerCase() ===
					exact.name.toLocaleLowerCase()
			)
		)
			candidates = [{ ...exact, uuid: exact.uuid }, ...candidates].slice(
				0,
				10
			)
	} catch {
		// name lookup is best-effort: local candidates still answer
	}
	const names = candidates.map((candidate) => candidate.name)
	const uuids = candidates
		.map((candidate) => candidate.uuid)
		.filter((uuid): uuid is string => typeof uuid === 'string')
	const nominees = await prisma.awardNominee.findMany({
		where: {
			category_id: categoryId,
			OR: [
				...(uuids.length ? [{ player_uuid: { in: uuids } }] : []),
				...(names.length
					? names.map((name) => ({
							name: {
								equals: name,
								mode: 'insensitive' as const,
							},
						}))
					: []),
			],
		},
		select: { id: true, name: true, player_uuid: true },
	})
	const nomineeByKey = new Map(
		nominees.map((row) => [
			playerNameKey(row.player_uuid ?? row.name),
			row.id,
		])
	)
	const nomineeId = (candidate: (typeof candidates)[number]) =>
		(candidate.uuid && nomineeByKey.get(candidate.uuid)) ??
		nomineeByKey.get(playerNameKey(candidate.name)) ??
		null
	return {
		category_id: category.id,
		campaign_id: category.campaign_id,
		items: candidates.map((candidate) => ({
			name: candidate.name,
			alliance: candidate.alliance,
			region: candidate.region,
			nominee_id: nomineeId(candidate),
		})),
	}
}

export async function playerTop(
	categoryId: string,
	limit = 10
) {
	const category = await prisma.awardCategory.findUnique({
		where: { id: categoryId },
		select: { id: true, kind: true },
	})
	if (!category || category.kind !== 'PLAYER')
		throw err(422, 'invalid_category')
	const rows = await prisma.awardNominee.findMany({
		where: { category_id: categoryId },
		select: {
			id: true,
			name: true,
			avatar_url: true,
			player_uuid: true,
			player_region: true,
			player_alliance: true,
			votes: { where: { excluded_at: null }, select: { id: true } },
		},
	})
	const ranked = rows.map((row) => ({
		id: row.id,
		name: row.name,
		avatar_url: row.avatar_url,
		player_uuid: row.player_uuid,
		region: row.player_region,
		alliance: row.player_alliance,
		votes: row.votes.length,
	}))
	return topPlayerNominees(ranked, Math.min(Math.max(limit, 1), 20)).map(
		(row) => ({
			id: row.id,
			name: row.name,
			avatar_url: row.avatar_url,
			player_uuid: row.player_uuid,
			region: row.region,
			alliance: row.alliance,
		})
	)
}
