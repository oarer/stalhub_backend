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