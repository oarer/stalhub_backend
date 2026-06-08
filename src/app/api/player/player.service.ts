import {
	playerLookupErrorsTotal,
	playerLookupsTotal,
	popularPlayerViewsTotal,
	recordAppError,
	setBlacklistCount,
	setRecentPlayersCount,
} from '@/app/api/metrics'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { prisma } from '@/lib/prisma'
import type {
	PlayerParams,
	PlayerResponse,
	PlayerRole,
} from '@/types/player.type'
import * as cache from './cache'

type ServiceResponse<T> = {
	success: boolean
	message: string
	data: T
}

type PlayerNoteDTO = {
	uuid: string
	description: string | null
	role: PlayerRole
}

type PopularPlayerDTO = {
	uuid: string
	username: string
	alliance: string
	region: string
	views: number
	role: PlayerRole | null
}

type RecentPlayerDTO = {
	uuid: string
	username: string
	alliance: string
	region: string
	role: PlayerRole | null
}

const recentPlayersList: RecentPlayerDTO[] = []
const blacklistSet = new Set<string>()

class PlayerService {
	private async loadBlacklist(): Promise<void> {
		const entries = await prisma.playerBlacklist.findMany({
			select: { uuid: true },
		})
		blacklistSet.clear()
		entries.forEach((e) => blacklistSet.add(e.uuid))
		setBlacklistCount(blacklistSet.size)
	}

	private isBlacklisted(uuid: string): boolean {
		return blacklistSet.has(uuid)
	}

	async init(): Promise<void> {
		await this.loadBlacklist()
	}

	async get({ region, character }: PlayerParams): Promise<PlayerResponse> {
		const cached = await cache.getPlayer(region, character)
		if (cached) return cached

		let data: PlayerResponse
		try {
			;({ data } = await apiClient.get<PlayerResponse>(
				`/${region}/character/by-name/${character}/profile`
			))
			playerLookupsTotal.inc({ region })
		} catch (err) {
			playerLookupErrorsTotal.inc({ region })
			recordAppError('player_lookup')
			throw err
		}

		const note = await prisma.playerNote.findUnique({
			where: { uuid: data.uuid },
		})

		await this.incrementPopularPlayer(
			data.uuid,
			data.username,
			data.alliance,
			region
		)
		this.addRecentPlayer(
			data.uuid,
			data.username,
			data.alliance,
			region,
			(note?.role as PlayerRole) ?? null
		)

		const result: PlayerResponse = {
			...data,
			role: {
				role: (note?.role as PlayerRole) ?? null,
				description: note?.description ?? null,
			},
		}

		await cache.setPlayer(region, character, result)
		return result
	}

	async list(role?: PlayerRole) {
		const where = role ? { role } : {}

		const notes = await prisma.playerNote.findMany({ where })

		return notes
	}

	async create(data: {
		uuid: string
		description: string
		role: PlayerRole
	}): Promise<ServiceResponse<PlayerNoteDTO>> {
		const note = await prisma.playerNote.create({
			data,
		})

		return {
			success: true,
			message: 'Player note has been successfully created',
			data: {
				uuid: note.uuid,
				role: note.role as PlayerRole,
				description: note.description,
			},
		}
	}

	async patch(data: {
		uuid: string
		description?: string
		role?: PlayerRole
	}): Promise<ServiceResponse<PlayerNoteDTO>> {
		const updated = await prisma.playerNote.update({
			where: { uuid: data.uuid },
			data: {
				...(data.description !== undefined && {
					description: data.description,
				}),
				...(data.role !== undefined && { role: data.role }),
			},
		})

		return {
			success: true,
			message: 'Player note has been successfully updated',
			data: {
				uuid: updated.uuid,
				role: updated.role as PlayerRole,
				description: updated.description,
			},
		}
	}

	async delete(uuid: string): Promise<ServiceResponse<{ uuid: string }>> {
		await prisma.playerNote.delete({
			where: { uuid },
		})

		return {
			success: true,
			message: 'Player note has been successfully deleted',
			data: { uuid },
		}
	}

	private async incrementPopularPlayer(
		uuid: string,
		username: string,
		alliance: string,
		region: string
	): Promise<void> {
		if (this.isBlacklisted(uuid)) return

		await prisma.popularPlayer.upsert({
			where: { uuid },
			update: { views: { increment: 1 } },
			create: { uuid, username, alliance, region, views: 1 },
		})
		popularPlayerViewsTotal.inc()
	}

	private addRecentPlayer(
		uuid: string,
		username: string,
		alliance: string,
		region: string,
		role: PlayerRole | null
	): void {
		if (this.isBlacklisted(uuid)) return

		const existingIndex = recentPlayersList.findIndex(
			(p) => p.uuid === uuid
		)
		if (existingIndex !== -1) {
			recentPlayersList.splice(existingIndex, 1)
		}

		recentPlayersList.unshift({ uuid, username, alliance, region, role })

		if (recentPlayersList.length > 10) {
			recentPlayersList.pop()
		}
		setRecentPlayersCount(recentPlayersList.length)
	}

	async getPopularPlayers(limit = 50): Promise<PopularPlayerDTO[]> {
		const players = await prisma.popularPlayer.findMany({
			orderBy: { views: 'desc' },
			take: limit,
		})

		const uuids = players.map((p) => p.uuid)
		const notes = await prisma.playerNote.findMany({
			where: { uuid: { in: uuids } },
		})
		const notesByUuid = Object.fromEntries(notes.map((n) => [n.uuid, n]))

		return players
			.filter((p) => !this.isBlacklisted(p.uuid))
			.map((p) => ({
				uuid: p.uuid,
				username: p.username,
				alliance: p.alliance,
				region: p.region,
				views: p.views,
				role: (notesByUuid[p.uuid]?.role as PlayerRole) ?? null,
			}))
	}

	async getRecentPlayers(): Promise<RecentPlayerDTO[]> {
		return recentPlayersList.filter((p) => !this.isBlacklisted(p.uuid))
	}

	async addToBlacklist(
		uuid: string
	): Promise<ServiceResponse<{ uuid: string }>> {
		await prisma.playerBlacklist.create({
			data: { uuid },
		})
		blacklistSet.add(uuid)
		setBlacklistCount(blacklistSet.size)

		return {
			success: true,
			message: 'Player has been added to blacklist',
			data: { uuid },
		}
	}

	async removeFromBlacklist(
		uuid: string
	): Promise<ServiceResponse<{ uuid: string }>> {
		await prisma.playerBlacklist.delete({
			where: { uuid },
		})
		blacklistSet.delete(uuid)
		setBlacklistCount(blacklistSet.size)

		return {
			success: true,
			message: 'Player has been removed from blacklist',
			data: { uuid },
		}
	}

	async getBlacklist(): Promise<{ uuid: string; createdAt: Date }[]> {
		return prisma.playerBlacklist.findMany({
			select: { uuid: true, createdAt: true },
			orderBy: { createdAt: 'desc' },
		})
	}
}

export const playerService = new PlayerService()
