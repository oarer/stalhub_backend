import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { backendPost } from '../../lib/api'
import { errMsg } from '../../lib/errors'
import { error } from '../../lib/logger'

export async function handleJoin(interaction: ChatInputCommandInteraction) {
	const code = interaction.options.getString('code', true)

	await interaction.deferReply({ ephemeral: true })
	try {
		const res = (await backendPost('/internal/bot/invites/claim', {
			discord_id: interaction.user.id,
			code,
		})) as {
			ok: boolean
			username?: string
			clan_id?: string
			error?: string
		}
		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle('Доступ активирован')
			.setDescription(
				`Код активирован для аккаунта **${res.username}**, клан привязан.`
			)
		await interaction.editReply({ embeds: [embed] })
	} catch (err) {
		error('Command /join failed:', err)
		await interaction.editReply(`Ошибка: ${errMsg(err)}`)
	}
}
