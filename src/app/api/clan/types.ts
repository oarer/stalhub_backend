export interface AIScreenshotResult {
	mapName: string | null
	totalScore: number | null
	opponentScore: number | null
	teams: Array<{
		name: string | null
		score: number | null
		isPlayerClan: boolean
	}>
	victory: boolean | null
	players: Array<{
		name: string
		kills: number | null
		deaths: number | null
		assists: number | null
		score: number | null
		role: string | null
		isClanMember?: boolean
	}>
	rawText?: string
}
