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

class PlayerService {
    async get({ region, character }: PlayerParams): Promise<PlayerResponse> {
        const { data } = await apiClient.get<PlayerResponse>(
            `/${region}/character/by-name/${character}/profile`
        )

        const note = await prisma.playerNote.findUnique({
            where: { uuid: data.uuid },
        })

        return {
            ...data,
            role: {
                role: (note?.role as PlayerRole) ?? 'exbo',
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
                ...(data.description !== undefined && { description: data.description }),
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
}

export const playerService = new PlayerService()