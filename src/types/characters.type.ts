import type { PlayerResponse, Stat } from './player.type'

export interface CharacterEntry {
	information: {
		id: string
		name: string
		creationTime: string
	}
}

export interface CachedPlayer {
	username: string
	uuid: string
	status: string
	alliance: PlayerResponse['alliance'] | null
	lastLogin: string | null

	clan: {
		info: {
			id: string
			name: string
			level: number
			registrationTime: string
			alliance: string
		}
		member: {
			rank: string
			joinTime: string
		}
	} | null

	stats: Stat[]
}
