export interface RecruitmentSettingsInput {
	leader_discord: string
	clan_discord: string | null
	paid_recruitment: boolean
	guilds_per_week: number | null
}

export function normalizeRecruitmentSettings(
	data: RecruitmentSettingsInput
): RecruitmentSettingsInput {
	const leaderDiscord = data.leader_discord.trim()
	if (!leaderDiscord) throw new Error('Leader Discord is required')
	if (leaderDiscord.length > 100) throw new Error('Leader Discord is too long')

	const clanDiscord = data.clan_discord?.trim() || null
	if (clanDiscord && clanDiscord.length > 255)
		throw new Error('Clan Discord is too long')
	if (
		data.guilds_per_week !== null &&
		(!Number.isInteger(data.guilds_per_week) ||
			data.guilds_per_week < 0 ||
			data.guilds_per_week > 999)
	)
		throw new Error('Guilds per week must be an integer between 0 and 999')
	return {
		leader_discord: leaderDiscord,
		clan_discord: clanDiscord,
		paid_recruitment: data.paid_recruitment,
		guilds_per_week: data.guilds_per_week,
	}
}
