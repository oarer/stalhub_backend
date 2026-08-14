import {
	type AnySelectMenuInteraction,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type Client,
	MessageFlags,
} from 'discord.js'
import { type GuildSettings, getGuildSettings } from '../../lib/access'
import { backendDelete, backendGet, backendPost } from '../../lib/api'
import { errMsg } from '../../lib/errors'
import { error } from '../../lib/logger'
import { addDays, mskDateStr, mskHour } from '../../lib/msk'
import {
	ABSENCE_DEADLINE_MSK_HOUR,
	ABSENCE_ID,
	ABSENCE_MAX_STAGES,
	type AbsenceDraft,
	type AbsenceEntry,
	type AbsenceInteraction,
} from './types'
import {
	formComponents,
	formEmbed,
	listComponents,
	listEmbed,
	noteModal,
	removeConfirmComponents,
	removeConfirmEmbed,
	removeErrorEmbed,
	removeSuccessEmbed,
	saveSuccessEmbed,
} from './view'

const drafts = new Map<string, AbsenceDraft>()

function draftKey(interaction: AbsenceInteraction): string {
	return `${interaction.guildId ?? 'dm'}:${interaction.user.id}`
}

function staleReply(interaction: AbsenceInteraction) {
	return interaction.reply({
		content: 'Форма устарела, начните заново с /absence.',
		flags: MessageFlags.Ephemeral,
	})
}

function notLinkedReply(interaction: ButtonInteraction) {
	return interaction.reply({
		content: 'Бот не привязан к клану на этом сервере.',
		flags: MessageFlags.Ephemeral,
	})
}

function renderForm(draft: AbsenceDraft) {
	return {
		embeds: [formEmbed(draft)],
		components: formComponents(draft),
	}
}

async function refreshList(
	interaction: { client: Client },
	draft: AbsenceDraft
) {
	try {
		const data = (await backendGet(
			`/internal/bot/clans/${encodeURIComponent(draft.clanId)}/absences?date=${encodeURIComponent(draft.sourceDate)}`
		)) as { absences: AbsenceEntry[] }
		const channel = await interaction.client.channels.fetch(
			draft.sourceChannelId
		)
		if (!channel?.isTextBased()) return
		const message = await channel.messages.fetch(draft.sourceMessageId)
		await message.edit({
			embeds: [
				listEmbed(draft.clan, draft.sourceDate, data.absences ?? []),
			],
			components: listComponents(draft.sourceDate),
		})
	} catch (err) {
		error('Absence: failed to refresh list message', err)
	}
}

export async function handleAbsenceListCommand(
	interaction: ChatInputCommandInteraction,
	settings: GuildSettings
) {
	const date = interaction.options.getString('date') ?? mskDateStr()
	await interaction.deferReply()
	try {
		const data = (await backendGet(
			`/internal/bot/clans/${encodeURIComponent(settings.clan_id)}/absences?date=${encodeURIComponent(date)}`
		)) as { absences: AbsenceEntry[] }
		const clan = settings.clan ?? { name: 'Клан', tag: '' }
		await interaction.editReply({
			embeds: [listEmbed(clan, date, data.absences ?? [])],
			components: listComponents(date),
		})
	} catch (err) {
		await interaction.editReply(`Ошибка: ${errMsg(err)}`)
	}
}

async function handleSetDraft(interaction: ButtonInteraction, date: string) {
	const settings = await getGuildSettings(interaction.guildId)
	if (!settings?.clan_id) {
		await notLinkedReply(interaction)
		return
	}
	const today = mskDateStr()
	const draft: AbsenceDraft = {
		mode: 'set',
		clanId: settings.clan_id,
		clan: settings.clan ?? { name: 'Клан', tag: '' },
		sourceChannelId: interaction.message.channelId,
		sourceMessageId: interaction.message.id,
		sourceDate: date,
		date:
			date === today && mskHour() >= ABSENCE_DEADLINE_MSK_HOUR
				? addDays(today, 1)
				: date,
		events: [],
		stages: [],
		note: '',
	}
	drafts.set(draftKey(interaction), draft)
	await interaction.reply({
		...renderForm(draft),
		flags: MessageFlags.Ephemeral,
	})
}

async function handleRemoveConfirm(
	interaction: ButtonInteraction,
	date: string
) {
	const settings = await getGuildSettings(interaction.guildId)
	if (!settings?.clan_id) {
		await notLinkedReply(interaction)
		return
	}
	const draft: AbsenceDraft = {
		mode: 'remove',
		clanId: settings.clan_id,
		clan: settings.clan ?? { name: 'Клан', tag: '' },
		sourceChannelId: interaction.message.channelId,
		sourceMessageId: interaction.message.id,
		sourceDate: date,
		date,
		events: [],
		stages: [],
		note: '',
	}
	drafts.set(draftKey(interaction), draft)
	await interaction.reply({
		embeds: [removeConfirmEmbed(date)],
		components: removeConfirmComponents(),
		flags: MessageFlags.Ephemeral,
	})
}

function parseCustomDate(customId: string, action: 'open' | 'remove'): string {
	const prefix =
		action === 'open' ? ABSENCE_ID.open('') : ABSENCE_ID.remove('')
	return customId.slice(prefix.length)
}

export async function handleAbsenceComponent(
	interaction: AbsenceInteraction
): Promise<void> {
	const key = draftKey(interaction)
	const customId = interaction.customId

	if (interaction.isModalSubmit()) {
		const draft = drafts.get(key)
		if (!draft || draft.mode !== 'set') {
			await staleReply(interaction)
			return
		}
		draft.note = interaction.fields
			.getTextInputValue(ABSENCE_ID.noteInput)
			.trim()
		const updatable = interaction as unknown as {
			update(options: unknown): Promise<unknown>
		}
		await updatable.update(renderForm(draft))
		return
	}

	if (
		customId === ABSENCE_ID.date ||
		customId === ABSENCE_ID.event ||
		customId === ABSENCE_ID.stages
	) {
		const draft = drafts.get(key)
		if (!draft || draft.mode !== 'set') {
			await staleReply(interaction)
			return
		}
		const select = interaction as AnySelectMenuInteraction
		if (customId === ABSENCE_ID.date) {
			draft.date = select.values[0]
		} else if (customId === ABSENCE_ID.event) {
			draft.events = [...select.values]
			const maxStage = Math.max(
				...draft.events.map((e) => ABSENCE_MAX_STAGES[e] ?? 0),
				0
			)
			draft.stages = draft.stages.filter((s) => s <= maxStage)
		} else {
			draft.stages = select.values.map(Number)
		}
		await interaction.update(renderForm(draft))
		return
	}

	if (customId === ABSENCE_ID.note) {
		const draft = drafts.get(key)
		if (!draft || draft.mode !== 'set') {
			await staleReply(interaction)
			return
		}
		await interaction.showModal(noteModal(draft.note))
		return
	}

	if (customId === ABSENCE_ID.save) {
		const draft = drafts.get(key)
		if (!draft || draft.mode !== 'set') {
			await staleReply(interaction)
			return
		}
		if (!draft.events.length) {
			await interaction.reply({
				content: 'Выберите хотя бы одно событие.',
				flags: MessageFlags.Ephemeral,
			})
			return
		}
		await interaction.deferUpdate()
		try {
			await backendPost('/internal/bot/absences', {
				discord_id: interaction.user.id,
				clan_id: draft.clanId,
				date: draft.date,
				events: draft.events.map((eventType) => ({
					eventType,
					...(draft.stages.length ? { stages: draft.stages } : {}),
				})),
				...(draft.note ? { note: draft.note } : {}),
			})
			await interaction.editReply({
				embeds: [saveSuccessEmbed(draft)],
				components: [],
			})
			drafts.delete(key)
			await refreshList(interaction, draft)
		} catch (err) {
			await interaction.followUp({
				content: `Ошибка: ${errMsg(err)}`,
				flags: MessageFlags.Ephemeral,
			})
		}
		return
	}

	if (customId === ABSENCE_ID.cancel) {
		drafts.delete(key)
		await interaction.update({
			content: 'Отменено.',
			embeds: [],
			components: [],
		})
		return
	}

	if (customId === ABSENCE_ID.removeConfirm) {
		const draft = drafts.get(key)
		if (!draft || draft.mode !== 'remove') {
			await staleReply(interaction)
			return
		}
		await interaction.deferUpdate()
		try {
			await backendDelete('/internal/bot/absences', {
				discord_id: interaction.user.id,
				clan_id: draft.clanId,
				date: draft.date,
			})
			await interaction.editReply({
				embeds: [removeSuccessEmbed(draft.date)],
				components: [],
			})
			drafts.delete(key)
			await refreshList(interaction, draft)
		} catch (err) {
			await interaction.editReply({
				embeds: [removeErrorEmbed(errMsg(err))],
				components: [],
			})
		}
		return
	}

	if (customId === ABSENCE_ID.removeCancel) {
		drafts.delete(key)
		await interaction.update({
			content: 'Отменено.',
			embeds: [],
			components: [],
		})
		return
	}

	if (customId.startsWith(ABSENCE_ID.open(''))) {
		await handleSetDraft(
			interaction as ButtonInteraction,
			parseCustomDate(customId, 'open')
		)
		return
	}

	if (customId.startsWith(ABSENCE_ID.remove(''))) {
		await handleRemoveConfirm(
			interaction as ButtonInteraction,
			parseCustomDate(customId, 'remove')
		)
		return
	}
}
