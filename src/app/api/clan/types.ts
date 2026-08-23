export interface AIScreenshotResult {
	map_name: string | null
	stage_number: number | null
	total_score: number | null
	opponent_score: number | null
	teams: Array<{
		name: string | null
		score: number | null
		is_player_clan: boolean
	}>
	victory: boolean | null
	players: Array<{
		name: string
		kills: number | null
		deaths: number | null
		assists: number | null
		score: number | null
		role: string | null
		is_clan_member?: boolean
	}>
	raw_text?: string
}
