import type { ChatInputCommandInteraction } from 'discord.js'
import { backendUpload } from '../../lib/api'
import { errMsg } from '../../lib/errors'
import { error } from '../../lib/logger'
import { mskDateStr } from '../../lib/msk'
import {
	needsParams,
	startScreenshotPrompt,
} from './prompt'

function blobPart(buf: Buffer): BlobPart {
	return new Uint8Array(buf)
}

export async function handleScreenshot(
	interaction: ChatInputCommandInteraction,
	clanId: string
) {
	const type = interaction.options.getString('type')
	const stage = interaction.options.getInteger('stage')
	const date = interaction.options.getString('date') ?? mskDateStr()
	const attachment = interaction.options.getAttachment('image', true)

	await interaction.deferReply()
	let buf: Buffer
	try {
		const res = await fetch(attachment.url)
		if (!res.ok) throw new Error('Не удалось скачать изображение')
		buf = Buffer.from(await res.arrayBuffer())
	} catch (err) {
		await interaction.editReply(`Ошибка: ${errMsg(err)}`)
		return
	}

	const form = new FormData()
	form.append('clan_id', clanId)
	if (type) form.append('type', type)
	if (stage) form.append('stage', String(stage))
	form.append('date', date)
	form.append(
		'file',
		new Blob([blobPart(buf)], { type: attachment.contentType ?? 'image/png' }),
		attachment.name
	)
	try {
		const data = (await backendUpload(
			'/internal/bot/screenshots',
			form
		)) as {
			session: { id: number; map_name: string }
			screenshot: { id: number }
			detected?: { type: string; stage: number } | null
		}
		const detected = data.detected
			? ` [${data.detected.type} этап ${data.detected.stage}]`
			: ''
		await interaction.editReply(
			`Скриншот загружен: сессия #${data.session.id} (${data.session.map_name}), скрин #${data.screenshot.id}${detected}`
		)
	} catch (err) {
		error(`Command /screenshot failed:`, err)
		if (needsParams(err)) {
			await startScreenshotPrompt(
				interaction,
				interaction.guildId,
				interaction.user.id,
				clanId,
				{
					name: attachment.name,
					type: attachment.contentType ?? 'image/png',
					buffer: buf,
				},
				{
					...(interaction.options.getString('date')
						? { date: interaction.options.getString('date')! }
						: {}),
					...(stage ? { stage } : {}),
					...(type ? { type } : {}),
				}
			)
			return
		}
		await interaction.editReply(`Ошибка: ${errMsg(err)}`)
	}
}