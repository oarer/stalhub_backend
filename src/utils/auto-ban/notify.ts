import { env } from '@/env'

export type AdminAlertField = {
	name: string
	value: string
	inline?: boolean
}

export type AdminAlert = {
	title: string
	description?: string
	color?: number
	fields?: AdminAlertField[]
}

export const DiscordEmbedColors = {
	warn: 0xff9f0a,
	ban: 0xff3b30,
	skip: 0x5ac8fa,
} as const

export async function notifyAdmins(alert: AdminAlert | string): Promise<void> {
	const url = env.ADMIN_ALERT_WEBHOOK
	if (!url) return

	const embed =
		typeof alert === 'string'
			? {
					title: 'AUTO-BAN',
					description: alert,
					color: DiscordEmbedColors.ban,
				}
			: {
					title: alert.title,
					description: alert.description,
					color: alert.color,
					fields: alert.fields,
				}

	try {
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				embeds: [
					{
						...embed,
						timestamp: new Date().toISOString(),
					},
				],
			}),
		})
	} catch (err) {
		console.error('[AutoBan] Failed to notify admins:', err)
	}
}
