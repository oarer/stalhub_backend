import type { Regions } from './api.type'

export enum PlayerRole {
    EXBO = 'EXBO',
    SCAMMER = 'SCAMMER',
    MEDIA = 'MEDIA',
    STALHUB ='STALHUB',
}

export interface PlayerResponse {
	username: string
	uuid: string
	status: string
	alliance: Alliance
	lastLogin: Date
	displayedAchievements: Achievements[]
	clan: Clan
	stats: Stat[]
	role?: {
		role: PlayerRole
		description: string | null
	}
}

export interface PlayerParams {
	region: Regions
	character: string
}

export type Achievements = string

export type StatType = 'INTEGER' | 'DECIMAL' | 'DATE' | 'DURATION'
export type StatCategory =
	| 'EXPLORATION'
	| 'COMBAT'
	| 'SESSION_MODES'
	| 'ECONOMY'
	| 'NONE'
	| 'HIDEOUT'
type StatValue = number | Date | string

export interface Stat {
	id: string
	type: StatType
	value: StatValue
}

export type ClanMemberRank =
	| 'RECRUIT'
	| 'COMMONER'
	| 'SOLDIER'
	| 'SERGEANT'
	| 'OFFICER'
	| 'COLONEL'
	| 'LEADER'

export interface ClanMember {
	name: string
	rank: ClanMemberRank
	joinTime: Date
}

export interface ClanInfo {
	id: string
	name: string
	tag: string
	level: number
	levelPoints: number
	registrationTime: Date
	alliance: string
	description: string
	leader: string
	memberCount: number
}

export interface Clan {
	info: ClanInfo
	member: ClanMember
}

export enum Alliance {
	MERC = 'merc',
	COVENANT = 'covenant',
	FREEDOM = 'freedom',
	DUTY = 'duty',
	BANDITS = 'bandits',
	STALKERS = 'stalkers',
}
