import { apiClient } from '@/app/interceptors/sc.interceptor'
import { prisma } from '@/lib/prisma'
import type {
	PlayerParams,
	PlayerResponse,
	PlayerRole,
} from '@/types/player.type'

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
}

type RecentPlayerDTO = {
	uuid: string
	username: string
	alliance: string
	region: string
}

const recentPlayersList: RecentPlayerDTO[] = []
const RECENT_PLAYERS_LIMIT = 10

class PlayerService {
	async get({ region, character }: PlayerParams): Promise<PlayerResponse> {
		const { data } = await apiClient.get<PlayerResponse>(
			`/${region}/character/by-name/${character}/profile`
		)

		const note = await prisma.playerNote.findUnique({
			where: { uuid: data.uuid },
		})

		await this.incrementPopularPlayer(
			data.uuid,
			data.username,
			data.alliance,
			region
		)
		this.addRecentPlayer(data.uuid, data.username, data.alliance, region)

		return {
			...data,
			role: {
				role: (note?.role as PlayerRole) ?? null,
				description: note?.description ?? null,
			},
		}
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
		await prisma.popularPlayer.upsert({
			where: { uuid },
			update: { views: { increment: 1 } },
			create: { uuid, username, alliance, region, views: 1 },
		})
	}

	private addRecentPlayer(
		uuid: string,
		username: string,
		alliance: string,
		region: string
	): void {
		const existingIndex = recentPlayersList.findIndex(
			(p) => p.uuid === uuid
		)
		if (existingIndex !== -1) {
			recentPlayersList.splice(existingIndex, 1)
		}

		recentPlayersList.unshift({ uuid, username, alliance, region })

		if (recentPlayersList.length > RECENT_PLAYERS_LIMIT) {
			recentPlayersList.pop()
		}
	}

	async getPopularPlayers(limit = 50): Promise<PopularPlayerDTO[]> {
		const players = await prisma.popularPlayer.findMany({
			orderBy: { views: 'desc' },
			take: limit,
		})

		return players.map((p) => ({
			uuid: p.uuid,
			username: p.username,
			alliance: p.alliance,
			region: p.region,
			views: p.views,
		}))
	}

	async getRecentPlayers(): Promise<RecentPlayerDTO[]> {
		return [...recentPlayersList]
	}
}

export const playerService = new PlayerService()
