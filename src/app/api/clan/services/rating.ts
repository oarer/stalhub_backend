import type { StageType } from 'generated/prisma/enums'
import { prisma } from '@/lib/prisma'

export type ClanTier = 'E' | 'D' | 'C' | 'B' | 'A' | 'S'

export function clanTierForRating(rating: number): ClanTier {
	if (rating >= 2201) return 'S'
	if (rating >= 2000) return 'A'
	if (rating >= 1750) return 'B'
	if (rating >= 1500) return 'C'
	if (rating >= 1250) return 'D'
	return 'E'
}

export function ratingDeltaForResult(
	type: StageType | string,
	victory: boolean | null,
	inSeason: boolean
): number | null {
	if (type !== 'TOURNAMENT' || !inSeason || victory == null) return null
	return victory ? 50 : -50
}

export function applyRatingDelta(rating: number, delta: number): number {
	return Math.max(0, rating + delta)
}

export async function applySessionRating(
	session_id: number,
	victory: boolean | null
) {
	return prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM "stage_sessions" WHERE id = ${session_id} FOR UPDATE`
		const session = await tx.stageSession.findUnique({
			where: { id: session_id },
			select: {
				id: true,
				clan_id: true,
				type: true,
				started_at: true,
				rating_event: true,
			},
		})
		if (!session?.clan_id) return null

		const season = await tx.clanSeason.findFirst({
			where: {
				starts_at: { lte: session.started_at },
				ends_at: { gt: session.started_at },
			},
			orderBy: { starts_at: 'desc' },
		})
		await tx.$queryRaw`SELECT id FROM "clans" WHERE id = ${session.clan_id} FOR UPDATE`
		const clan = await tx.clan.findUniqueOrThrow({
			where: { id: session.clan_id },
			select: { rating: true },
		})
		const desiredDelta = ratingDeltaForResult(session.type, victory, season != null)
		let rating = clan.rating
		if (session.rating_event) {
			rating = applyRatingDelta(rating, -session.rating_event.delta)
			await tx.clanRatingEvent.delete({ where: { id: session.rating_event.id } })
		}
		let event = null
		if (desiredDelta != null && season) {
			const nextRating = applyRatingDelta(rating, desiredDelta)
			const appliedDelta = nextRating - rating
			rating = nextRating
			if (appliedDelta !== 0) {
				event = await tx.clanRatingEvent.create({
					data: {
						clan_id: session.clan_id,
						season_id: season.id,
						session_id: session.id,
						delta: appliedDelta,
					},
				})
			}
		}
		await tx.clan.update({
			where: { id: session.clan_id },
			data: { rating, tier: clanTierForRating(rating) },
		})
		return event
	})
}

export async function reverseSessionRating(session_id: number) {
	return prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM "stage_sessions" WHERE id = ${session_id} FOR UPDATE`
		const event = await tx.clanRatingEvent.findUnique({
			where: { session_id },
		})
		if (!event) return null

		await tx.$queryRaw`SELECT id FROM "clans" WHERE id = ${event.clan_id} FOR UPDATE`
		const clan = await tx.clan.findUnique({
			where: { id: event.clan_id },
			select: { rating: true },
		})
		if (!clan) return null

		const rating = applyRatingDelta(clan.rating, -event.delta)
		await tx.clanRatingEvent.delete({ where: { id: event.id } })
		await tx.clan.update({
			where: { id: event.clan_id },
			data: { rating, tier: clanTierForRating(rating) },
		})
		return { rating, tier: clanTierForRating(rating) }
	})
}

export async function deleteSessionWithRating(session_id: number) {
	return prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM "stage_sessions" WHERE id = ${session_id} FOR UPDATE`
		const event = await tx.clanRatingEvent.findUnique({ where: { session_id } })
		if (event) {
			await tx.$queryRaw`SELECT id FROM "clans" WHERE id = ${event.clan_id} FOR UPDATE`
			const clan = await tx.clan.findUniqueOrThrow({
				where: { id: event.clan_id },
				select: { rating: true },
			})
			const rating = applyRatingDelta(clan.rating, -event.delta)
			await tx.clanRatingEvent.delete({ where: { id: event.id } })
			await tx.clan.update({
				where: { id: event.clan_id },
				data: { rating, tier: clanTierForRating(rating) },
			})
		}
		await tx.stageSession.delete({ where: { id: session_id } })
		return { ok: true }
	})
}

export async function setClanRating(clan_id: string, rating: number) {
	if (!Number.isInteger(rating) || rating < 0)
		throw new Error('Clan rating must be a non-negative integer')
	return prisma.clan.update({
		where: { id: clan_id },
		data: { rating, tier: clanTierForRating(rating) },
		select: { id: true, rating: true, tier: true },
	})
}
