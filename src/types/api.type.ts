export enum Regions {
    RU = 'RU',
    EU = 'EU',
    NA = 'NA',
    SEA ='SEA',
    NEA = 'NEA'
}

export type ArtifactAdditional = {
    ndmg?: number
    qlt?: number
    it_transf_count?: number
    upgrade_bonus?: number
    spawn_time?: number
    ptn?: number
    bonus_properties?: string[]
    stats_random?: number
    md_k?: string | number
}

export interface Lot {
    itemId: string
    amount: number
    startPrice: number
    currentPrice?: number
    buyoutPrice: number
    startTime: Date
    endTime: Date
    additional?: ArtifactAdditional
}
export interface LotsResponse {
    total: number
    lots: Lot[]
}

export interface LotHistory {
    amount: number
    price: number
    time: Date
    additional?: ArtifactAdditional
}

export interface LotsHistoryResponse {
    total: number
    prices: LotHistory[]
}
