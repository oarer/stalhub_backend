import { commandDefinitions } from './app/commands'

async function main() {
	const { REST, Routes } = await import('discord.js')

	const token = process.env.DISCORD_BOT_TOKEN
	const clientId = process.env.DISCORD_CLIENT_ID
	if (!token || !clientId) {
		throw new Error('DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required')
	}

	const rest = new REST({ version: '10' }).setToken(token)
	await rest.put(Routes.applicationCommands(clientId), {
		body: commandDefinitions,
	})
	console.log(
		`Registered ${commandDefinitions.length} commands for client ${clientId}`
	)
}

main().catch((err) => {
	console.error('Failed to register commands:', err)
	process.exit(1)
})
