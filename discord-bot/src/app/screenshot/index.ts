import type { ChatInputCommandInteraction } from 'discord.js'
import { backendUpload } from '../../lib/api'
import { errMsg } from '../../lib/errors'
import { error } from '../../lib/logger'
import { mskDateStr } from '../../lib/msk'

export async function handleScreenshot(
	interaction: ChatInputCommandInteraction,
	clanId: string
) {
	const type = interaction.options.getString('type', true)
	const stage = interaction.options.getInteger('stage', true)
	const date = interaction.options.getString('date') ?? mskDateStr()
	const attachment = interaction.options.getAttachment('image', true)

	await interaction.deferReply()
	try {
		const res = await fetch(attachment.url)
		if (!res.ok) throw new Error('Не удалось скачать изображение')
		const buf = Buffer.from(await res.arrayBuffer())

		const form = new FormData()
		form.append('clan_id', clanId)
		form.append('type', type)
		form.append('stage', String(stage))
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
		}
		await interaction.editReply(
			`Скриншот загружен: сессия #${data.session.id} (${data.session.map_name}), скрин #${data.screenshot.id}`
		)
	} catch (err) {
		error(`Command /screenshot failed:`, err)
		await interaction.editReply(`Ошибка: ${errMsg(err)}`)
	}
}
