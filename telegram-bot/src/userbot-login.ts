import input from 'input'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'

function required(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`${name} is not set`)
	return value
}

async function main(): Promise<void> {
	if (!process.stdin.isTTY) {
		throw new Error(
			'Run the login helper from an interactive terminal (TTY).'
		)
	}
	const apiId = Number(required('TG_API_ID'))
	const apiHash = required('TG_API_HASH')
	if (!Number.isInteger(apiId) || apiId <= 0) {
		throw new Error('TG_API_ID must be a positive integer')
	}

	const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
		connectionRetries: 5,
	})
	await client.start({
		phoneNumber: async () =>
			process.env.TG_USERBOT_PHONE?.trim() ||
			(await input.text('Telegram phone number: ')),
		phoneCode: async () => input.text('Telegram login code: '),
		password: async () => input.text('Telegram 2FA password: '),
		onError: (error: Error) =>
			console.error('Telegram login failed:', error),
	})
	console.log(`TG_USERBOT_SESSION_STRING=${client.session.save()}`)
	await client.disconnect()
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(
			'Telegram userbot login failed:',
			error instanceof Error ? error.message : error
		)
		process.exit(1)
	})
}
