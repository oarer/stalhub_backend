import './lib/ws-proxy'
import type { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import { handleAbsenceComponent, handleAbsenceListCommand } from './app/absence'
import { commandDefinitions } from './app/commands'
import { handleScreenshot } from './app/screenshot'
import { handleSetup, handleSetupComponent } from './app/setup'
import { handlePublishSquads, publishSquads } from './app/squads'
import {
	type GuildSettings,
	getGuildSettings,
	hasGuildAccess,
	listGuildSettings,
	resolveMember,
} from './lib/access'
import { error, log, warn } from './lib/logger'
import { mskDateStr, mskHHMM } from './lib/msk'

interface GuildCommandHandler {
	(
		interaction: ChatInputCommandInteraction,
		settings: GuildSettings
	): Promise<void>
}

const guildCommandHandlers: Record<string, GuildCommandHandler> = {
	'publish-squads': (interaction, settings) =>
		handlePublishSquads(interaction, settings.clan_id),
	absence: handleAbsenceListCommand,
	screenshot: (interaction, settings) =>
		handleScreenshot(interaction, settings.clan_id),
}

async function main() {
	const { Client, Events, GatewayIntentBits }: typeof import('discord.js') =
		await import('discord.js')

	const client = new Client({ intents: [GatewayIntentBits.Guilds] })

	client.once(Events.ClientReady, (c) => {
		log(`Bot ready as ${c.user.tag} (id ${c.user.id})`)

		const published = new Set<string>()
		setInterval(async () => {
			let guilds
			try {
				guilds = await listGuildSettings()
			} catch (err) {
				error('Scheduler: failed to fetch guilds', err)
				return
			}
			for (const g of guilds) {
				if (!g.publish_time || !g.publish_channel_id) continue
				if (g.publish_time !== mskHHMM()) continue
				const day = mskDateStr()
				const key = `${g.guild_id}:${day}`
				if (published.has(key)) continue
				published.add(key)
				try {
					const channel = (await client.channels.fetch(
						g.publish_channel_id
					)) as TextChannel | null
					if (!channel) {
						error(
							`Scheduled publish: channel ${g.publish_channel_id} not found`
						)
						continue
					}
					log(
						`Publishing squads for clan ${g.clan_id} to channel ${g.publish_channel_id} (${day})`
					)
					await publishSquads(channel, g.clan_id)
				} catch (err) {
					error('Scheduled publish failed:', err)
				}
			}
		}, 60_000)
	})

	client.on(Events.InteractionCreate, async (interaction) => {
		if (
			interaction.isButton() ||
			interaction.isRoleSelectMenu() ||
			interaction.isChannelSelectMenu() ||
			interaction.isStringSelectMenu()
		) {
			if (interaction.customId.startsWith('setup:')) {
				await handleSetupComponent(interaction).catch((err) =>
					error('Setup component handler failed:', err)
				)
			} else if (interaction.customId.startsWith('abs:')) {
				await handleAbsenceComponent(interaction).catch((err) =>
					error('Absence component handler failed:', err)
				)
			}
			return
		}

		if (interaction.isModalSubmit()) {
			if (interaction.customId.startsWith('abs:')) {
				await handleAbsenceComponent(interaction).catch((err) =>
					error('Absence modal handler failed:', err)
				)
			}
			return
		}

		if (!interaction.isChatInputCommand()) return
		const command = interaction.commandName
		log(
			`Command /${command} from ${interaction.user.tag} (${interaction.user.id}) in ${interaction.guild?.name ?? 'DM'}`
		)
		if (command === 'ping') {
			await interaction.reply('Pong!')
			return
		}

		const settings = await getGuildSettings(interaction.guildId)

		if (command === 'setup') {
			await handleSetup(interaction)
			return
		}

		if (!settings?.clan) {
			await interaction.reply({
				content:
					'Бот не привязан к этому серверу. Используйте `/setup <токен>`, чтобы привязать клан.',
				ephemeral: true,
			})
			return
		}
		const member = resolveMember(interaction)
		if (
			!interaction.guild ||
			!member ||
			!hasGuildAccess(interaction.guild, member, settings)
		) {
			await interaction.reply({
				content: 'У вас нет доступа к этому боту на сервере.',
				ephemeral: true,
			})
			return
		}

		const handler = guildCommandHandlers[command]
		if (handler) {
			await handler(interaction, settings)
		}
	})

	client.on(Events.Warn, (info) => warn(info))
	client.on(Events.Error, (err) => error(err))

	const token = process.env.DISCORD_BOT_TOKEN
	if (!token) {
		error('DISCORD_BOT_TOKEN is not set')
		process.exit(1)
	}
	const clientId = process.env.DISCORD_CLIENT_ID
	log(`Backend URL: ${process.env.BACKEND_URL ?? 'http://localhost:3001'}`)

	try {
		const { REST, Routes } = await import('discord.js')
		const rest = new REST({ version: '10' }).setToken(token)
		if (clientId) {
			const result = (await rest.put(
				Routes.applicationCommands(clientId),
				{ body: commandDefinitions }
			)) as unknown as Array<{ name: string }>
			log(
				`Registered ${result.length} slash commands for client ${clientId}`
			)
		} else {
			warn(
				'DISCORD_CLIENT_ID is not set, skipping slash command registration'
			)
		}
	} catch (err) {
		error('Failed to register slash commands:', err)
	}

	log('Logging in to Discord...')
	client
		.login(token)
		.then(() => log('Discord gateway connected'))
		.catch((err) => {
			error('Discord login failed:', err)
			process.exit(1)
		})
}

main().catch((err) => {
	error('Fatal startup error:', err)
	process.exit(1)
})
