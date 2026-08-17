import type { ChatInputCommandInteraction } from 'discord.js'
import { backendUpload } from '../../lib/api'
import { errMsg } from '../../lib/errors'
import { error } from '../../lib/logger'
import { mskDateStr } from '../../lib/msk'

export async function handleScreenshot(
	interaction: ChatInputCommandInteraction,
	clanId: string
) {
	const type = interaction.options.getString('type')
	const stage = interaction.options.getInteger('stage')
	const date = interaction.options.getString('date') ?? mskDateStr()
	const attachment = interaction.options.getAttachment('image', true)

	await interaction.deferReply()
	try {
		const res = await fetch(attachment.url)
		if (!res.ok) throw new Error('Не удалось скачать изображение')
		const buf = Buffer.from(await res.arrayBuffer())

		const form = new FormData()
		form.append('clan_id', clanId)
		if (type) form.append('type', type)
		if (stage) form.append('stage', String(stage))
		form.append('date', date)
		form.append(
			'file',
			new Blob([buf], { type: attachment.contentType ?? 'image/png' }),
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
		const detected = data.detected
			? ` [${data.detected.type} этап ${data.detected.stage}]`
			: ''
		await interaction.editReply(
			`Скриншот загружен: сессия #${data.session.id} (${data.session.map_name}), скрин #${data.screenshot.id}${detected}`
		)
	} catch (err) {
		error(`Command /screenshot failed:`, err)
		await interaction.editReply(`Ошибка: ${errMsg(err)}`)
	}
}
