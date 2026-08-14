import type { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import { backendGet } from '../../lib/api'
import { errMsg } from '../../lib/errors'

interface SquadMember {
	name: string
	rank: string
	user: { id: number; username: string; name: string } | null
}

interface SquadEntry {
	map: string
	name: string
	leader: { member: SquadMember } | null
	members: Array<{ slot: number; member: SquadMember }>
}

function memberName(member?: SquadMember | null): string {
	return member?.user?.name || member?.name || '—'
}

function formatSquads(
	clan: { name: string; tag: string },
	squads: SquadEntry[]
): string {
	const byMap = new Map<string, SquadEntry[]>()
	for (const s of squads) {
		if (!byMap.has(s.map)) byMap.set(s.map, [])
		byMap.get(s.map)!.push(s)
	}
	const lines: string[] = []
	lines.push(`**${clan.name}${clan.tag ? ` [${clan.tag}]` : ''}** — отряды`)
	if (!squads.length) {
		lines.push('Отряды не созданы')
		return lines.join('\n')
	}
	for (const [map, list] of byMap) {
		lines.push('', `__${map}__`)
		for (const squad of list) {
			const leader = squad.leader?.member
			lines.push(
				`**${squad.name}**${leader ? ` (лидер: ${memberName(leader)})` : ''}`
			)
			const slots = [...squad.members]
				.sort((a, b) => a.slot - b.slot)
				.map((m) => `  ${m.slot + 1}. ${memberName(m.member)}`)
			lines.push(...(slots.length ? slots : ['  — свободен']))
		}
	}
	return lines.join('\n')
}

export async function fetchSquads(clanId: string) {
	return (await backendGet(
		`/internal/bot/clans/${encodeURIComponent(clanId)}/squads`
	)) as { clan: { name: string; tag: string }; squads: SquadEntry[] }
}

export async function publishSquads(
	target: TextChannel,
	clanId: string
): Promise<void> {
	const data = await fetchSquads(clanId)
	await target.send(formatSquads(data.clan, data.squads))
}

export async function handlePublishSquads(
	interaction: ChatInputCommandInteraction,
	clanId: string
) {
	await interaction.deferReply()
	try {
		const data = await fetchSquads(clanId)
		await interaction.editReply(formatSquads(data.clan, data.squads))
	} catch (err) {
		await interaction.editReply(`Ошибка: ${errMsg(err)}`)
	}
}
