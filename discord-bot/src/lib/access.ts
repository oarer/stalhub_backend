import type {
	BaseInteraction,
	ChatInputCommandInteraction,
	Guild,
	GuildMember,
} from 'discord.js'
import { PermissionFlagsBits } from 'discord.js'
import { backendGet } from './api'

export interface GuildClanInfo {
	id: string
	name: string
	tag: string
	region?: string
}

export interface GuildSettings {
	guild_id: string
	clan_id: string
	allowed_role_id: string | null
	publish_time: string | null
	publish_channel_id: string | null
	stages_channel_id: string | null
	linked_by: string
	clan: GuildClanInfo | null
}

export async function getGuildSettings(
	guildId: string | null
): Promise<GuildSettings | null> {
	if (!guildId) return null
	try {
		const data = (await backendGet(
			`/internal/bot/guilds/${encodeURIComponent(guildId)}`
		)) as { guild: GuildSettings }
		return data.guild
	} catch {
		return null
	}
}

export async function listGuildSettings(): Promise<GuildSettings[]> {
	const data = (await backendGet('/internal/bot/guilds')) as {
		guilds: GuildSettings[]
	}
	return data.guilds ?? []
}

function memberIsAdmin(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.Administrator)
}

export function hasGuildAccess(
	guild: Guild,
	member: GuildMember,
	settings: GuildSettings
): boolean {
	if (memberIsAdmin(member)) return true
	if (!settings.allowed_role_id) return true
	return member.roles.cache.has(settings.allowed_role_id)
}

export function resolveMember(
	interaction: ChatInputCommandInteraction | BaseInteraction
): GuildMember | null {
	const member = interaction.member
	if (!member || typeof member !== 'object') return null
	return member as GuildMember
}
