import type { Message } from 'discord.js'
import { getGuildSettings } from '../../lib/access'
import { backendUpload } from '../../lib/api'
import { errMsg } from '../../lib/errors'
import { error, log } from '../../lib/logger'
import { mskDateStr } from '../../lib/msk'
import { needsParams, startScreenshotPrompt } from '../screenshot/prompt'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export async function handleStageMessage(message: Message) {
	if (message.author.bot) return
	if (!message.guildId) return
	if (!message.attachments.size) return

	const settings = await getGuildSettings(message.guildId)
	if (!settings?.clan || !settings.stages_channel_id) return
	if (message.channel.id !== settings.stages_channel_id) return

	const images = [...message.attachments.values()].filter((a) =>
		IMAGE_TYPES.includes(a.contentType ?? '')
	)
	if (images.length === 0) return

	log(
		`Stage channel: ${images.length} image(s) from ${message.author.tag} in guild ${message.guildId}`
	)

	let ok = 0
	const errors: string[] = []
	let prompted = false
	for (const attachment of images) {
		if (prompted) continue
		let buf: Buffer
		try {
			const res = await fetch(attachment.url)
			if (!res.ok) throw new Error('Не удалось скачать изображение')
			buf = Buffer.from(await res.arrayBuffer())
		} catch (err) {
			error('Stage channel download failed:', err)
			errors.push(`${attachment.name}: ${errMsg(err)}`)
			continue
		}

		try {
			const form = new FormData()
			form.append('clan_id', settings.clan_id)
			form.append('date', mskDateStr())
			form.append(
				'file',
				new Blob([new Uint8Array(buf)], {
					type: attachment.contentType ?? 'image/png',
				}),
				attachment.name
			)
			const data = (await backendUpload(
				'/internal/bot/screenshots',
				form
			)) as {
				session: { id: number; map_name: string }
				screenshot: { id: number }
				detected?: { type: string; stage: number } | null
			}
			ok++
			log(
				`Stage screenshot saved: session #${data.session.id} screenshot #${data.screenshot.id}`
			)
		} catch (err) {
			error('Stage channel screenshot failed:', err)
			if (needsParams(err)) {
				prompted = true
				try {
					log(
						`Stage channel: asking for day/stage/type from ${message.author.tag}`
					)
					await startScreenshotPrompt(
						message,
						message.guildId,
						message.author.id,
						settings.clan_id,
						{
							name: attachment.name,
							type: attachment.contentType ?? 'image/png',
							buffer: buf,
						}
					)
				} catch (promptErr) {
					error('Stage channel screenshot prompt failed:', promptErr)
					errors.push(
						`${attachment.name}: ${errMsg(promptErr)}`
					)
				}
				continue
			}
			errors.push(`${attachment.name}: ${errMsg(err)}`)
		}
	}

	if (prompted) return

	const reply =
			ok > 0
				? `Скриншоты загружены (${ok}).`
				: `Не удалось загрузить скриншоты.`
	const detail = errors.length ? `\n${errors.slice(0, 3).join('\n')}` : ''
	await message
		.reply(reply + detail)
		.catch((err) => error('Failed to reply in stage channel:', err))
}
