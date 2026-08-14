import {
	ActionRowBuilder,
	type AnySelectMenuInteraction,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	type ChatInputCommandInteraction,
	Colors,
	EmbedBuilder,
	type Guild,
	type GuildChannel,
	MessageFlags,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js'
import {
	type GuildSettings,
	getGuildSettings,
	hasGuildAccess,
	resolveMember,
} from '../../lib/access'
import { backendDelete, backendPatch, backendPost } from '../../lib/api'
import { log } from '../../lib/logger'

const PUBLISH_TIMES = ['19:00', '20:00']

function roleName(guild: Guild, settings: GuildSettings): string {
	if (!settings.allowed_role_id) return 'не ограничено'
	return (
		guild.roles.cache.get(settings.allowed_role_id)?.name ?? 'роль удалена'
	)
}

function channelName(guild: Guild, settings: GuildSettings): string {
	if (!settings.publish_channel_id) return 'не выбран'
	const ch = guild.channels.cache.get(settings.publish_channel_id) as
		| GuildChannel
		| undefined
	return ch?.toString() ?? 'канал удалён'
}

function settingsEmbed(guild: Guild, settings: GuildSettings) {
	const clan = settings.clan
	const embed = new EmbedBuilder()
		.setColor(Colors.Blurple)
		.setTitle('Настройки бота')
		.setDescription(
			clan
				? `Клан: **${clan.name}${clan.tag ? ` [${clan.tag}]` : ''}**`
				: 'Клан не найден'
		)
		.addFields(
			{
				name: 'Роль доступа',
				value: roleName(guild, settings),
				inline: true,
			},
			{
				name: 'Время публикации отрядов',
				value: `${settings.publish_time ?? 'выключено'} MSK`,
				inline: true,
			},
			{
				name: 'Канал публикации',
				value: channelName(guild, settings),
				inline: true,
			}
		)
		.setFooter({ text: `Сервер: ${guild.name}` })
	return embed
}

function settingsComponents(guild: Guild, settings: GuildSettings) {
	const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
		new RoleSelectMenuBuilder()
			.setCustomId('setup:role')
			.setPlaceholder('Выбрать роль доступа')
			.setMinValues(1)
			.setMaxValues(1)
	)

	const timeOptions = [
		new StringSelectMenuOptionBuilder()
			.setLabel('Выключено')
			.setValue('off')
			.setDescription('Не публиковать отряды автоматически')
			.setDefault(!settings.publish_time),
		...PUBLISH_TIMES.map((t) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(`${t} MSK`)
				.setValue(t)
				.setDefault(settings.publish_time === t)
		),
	]
	const timeRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('setup:time')
				.setPlaceholder('Время публикации отрядов (MSK)')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(timeOptions)
		)

	const channelRow =
		new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
			new ChannelSelectMenuBuilder()
				.setCustomId('setup:channel')
				.setPlaceholder('Канал для публикации отрядов')
				.setChannelTypes(ChannelType.GuildText)
				.setMinValues(1)
				.setMaxValues(1)
		)

	const actionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId('setup:unlink')
			.setLabel('Отвязать клан')
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setCustomId('setup:close')
			.setLabel('Закрыть')
			.setStyle(ButtonStyle.Secondary)
	)

	return [roleRow, timeRow, channelRow, actionsRow]
}

function renderMenu(guild: Guild, settings: GuildSettings) {
	return {
		embeds: [settingsEmbed(guild, settings)],
		components: settingsComponents(guild, settings),
	}
}

function linkInstructionsEmbed() {
	return new EmbedBuilder()
		.setColor(Colors.Blurple)
		.setTitle('Бот ещё не привязан')
		.setDescription(
			'Чтобы привязать клан:\n' +
				'1. Откройте раздел клана на сайте и нажмите **«Привязать Discord бота»**.\n' +
				'2. Скопируйте токен из полученной команды.\n' +
				'3. Выполните здесь: `/setup <токен>`'
		)
}

export async function handleSetup(interaction: ChatInputCommandInteraction) {
	const guild = interaction.guild
	if (!guild) {
		await interaction.reply({
			content: 'Эта команда доступна только на сервере.',
			ephemeral: true,
		})
		return
	}

	const settings = await getGuildSettings(guild.id)
	const token = interaction.options.getString('token')

	if (!settings) {
		if (!token) {
			await interaction.reply({
				embeds: [linkInstructionsEmbed()],
				ephemeral: true,
			})
			return
		}
		await interaction.reply({
			content: 'Произошла ошибка',
			flags: MessageFlags.Ephemeral,
		})
		try {
			const res = (await backendPost('/internal/bot/link', {
				guild_id: guild.id,
				token: token.trim(),
				discord_id: interaction.user.id,
			})) as { guild: GuildSettings }
			log(`Guild ${guild.id} linked to clan ${res.guild.clan?.id}`)
			await interaction.editReply({
				content: res.guild.clan
					? `Клан **${res.guild.clan.name}${res.guild.clan.tag ? ` [${res.guild.clan.tag}]` : ''}** привязан к серверу.`
					: 'Клан привязан.',
				...renderMenu(guild, res.guild),
			})
		} catch (err) {
			await interaction.editReply(
				`Не удалось привязать клан: ${(err as Error).message}`
			)
		}
		return
	}

	const member = resolveMember(interaction)
	if (!member || !hasGuildAccess(guild, member, settings)) {
		await interaction.reply({
			content: 'У вас нет доступа к настройкам бота.',
			ephemeral: true,
		})
		return
	}
	await interaction.reply({ ...renderMenu(guild, settings), ephemeral: true })
}

export async function handleSetupComponent(
	interaction: AnySelectMenuInteraction | ButtonInteraction
) {
	const guild = interaction.guild
	if (!guild) return

	const customId = interaction.customId
	const settings = await getGuildSettings(guild.id)
	if (!settings) {
		await interaction.update({
			content: 'Клан не привязан.',
			embeds: [],
			components: [],
		})
		return
	}

	const member = resolveMember(interaction)
	if (!member || !hasGuildAccess(guild, member, settings)) {
		await interaction.reply({
			content: 'У вас нет доступа к настройкам бота.',
			ephemeral: true,
		})
		return
	}

	if (customId === 'setup:unlink') {
		const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId('setup:unlink:confirm')
				.setLabel('Да, отвязать')
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId('setup:unlink:cancel')
				.setLabel('Отмена')
				.setStyle(ButtonStyle.Secondary)
		)
		await interaction.update({
			embeds: [
				new EmbedBuilder()
					.setColor(Colors.Red)
					.setTitle('Отвязать клан?')
					.setDescription(
						'Бот перестанет публиковать отряды и проверять доступ на этом сервере.'
					),
			],
			components: [confirmRow],
		})
		return
	}

	if (customId === 'setup:unlink:cancel') {
		await interaction.update(renderMenu(guild, settings))
		return
	}

	if (customId === 'setup:unlink:confirm') {
		await backendDelete(
			`/internal/bot/guilds/${encodeURIComponent(guild.id)}`,
			{}
		)
		log(`Guild ${guild.id} unlinked`)
		await interaction.update({
			content:
				'Клан отвязан. Используйте `/setup <токен>`, чтобы привязать снова.',
			embeds: [],
			components: [],
		})
		return
	}

	if (customId === 'setup:close') {
		await interaction.update({
			content: 'Готово.',
			embeds: [],
			components: [],
		})
		return
	}

	const patch: Record<string, string | null> = {}
	if (customId === 'setup:role') {
		const roleId = (interaction as AnySelectMenuInteraction).values[0]
		patch.allowed_role_id =
			roleId === guild.roles.everyone.id ? null : roleId
	} else if (customId === 'setup:time') {
		const value = (interaction as AnySelectMenuInteraction).values[0]
		patch.publish_time = value === 'off' ? null : value
	} else if (customId === 'setup:channel') {
		patch.publish_channel_id = (
			interaction as AnySelectMenuInteraction
		).values[0]
	}

	if (!Object.keys(patch).length) return

	try {
		const res = (await backendPatch(
			`/internal/bot/guilds/${encodeURIComponent(guild.id)}`,
			patch
		)) as { guild: GuildSettings }
		await interaction.update(renderMenu(guild, res.guild))
	} catch (err) {
		await interaction.reply({
			content: `Ошибка сохранения: ${(err as Error).message}`,
			ephemeral: true,
		})
	}
}
