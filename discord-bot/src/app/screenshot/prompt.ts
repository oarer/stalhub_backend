import {
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type Message,
	MessageFlags,
} from 'discord.js'
import { backendUpload } from '../../lib/api'
import { errMsg, HttpError } from '../../lib/errors'
import { error } from '../../lib/logger'
import {
	SS_DAY_PREFIX,
	SS_ID,
	SS_STAGE_PREFIX,
	SS_TYPE_PREFIX,
	type ScreenshotDraft,
	type ScreenshotFile,
} from './types'
import { promptComponents, promptEmbed, successEmbed } from './view'

const drafts = new Map<string, ScreenshotDraft>()

function blobPart(buf: Buffer): BlobPart {
	return new Uint8Array(buf)
}

function ssKey(guildId: string | null, userId: string): string {
	return `${guildId ?? 'dm'}:${userId}`
}

function renderStep(draft: ScreenshotDraft) {
	return {
		embeds: [promptEmbed(draft)],
		components: promptComponents(draft),
	}
}

export function needsParams(err: unknown): boolean {
	return (
		err instanceof HttpError &&
		err.status === 400 &&
		Array.isArray(err.body?.required)
	)
}

export async function startScreenshotPrompt(
	target: ChatInputCommandInteraction | Message,
	guildId: string | null,
	userId: string,
	clanId: string,
	file: ScreenshotFile,
	seed: Partial<Pick<ScreenshotDraft, 'date' | 'stage' | 'type'>> = {}
) {
	const draft: ScreenshotDraft = {
		clanId,
		file,
		date: seed.date ?? null,
		stage: seed.stage ?? null,
		type: seed.type ?? null,
	}
	drafts.set(ssKey(guildId, userId), draft)

	if ('author' in target) {
		await target.reply(renderStep(draft))
	} else {
		await target.editReply(renderStep(draft))
	}
}

async function uploadScreenshot(draft: ScreenshotDraft) {
	const form = new FormData()
	form.append('clan_id', draft.clanId)
	form.append('type', draft.type ?? '')
	form.append('stage', String(draft.stage ?? ''))
	form.append('date', draft.date ?? '')
	form.append(
		'file',
		new Blob([blobPart(draft.file.buffer)], { type: draft.file.type }),
		draft.file.name
	)
	return (await backendUpload('/internal/bot/screenshots', form)) as {
		session: { id: number; map_name: string }
		screenshot: { id: number }
	}
}

export async function handleScreenshotComponent(
	interaction: ButtonInteraction
): Promise<void> {
	const key = ssKey(interaction.guildId, interaction.user.id)
	const draft = drafts.get(key)
	if (!draft) {
		await interaction.reply({
			content: 'Форма устарела. Отправьте скриншот заново.',
			flags: MessageFlags.Ephemeral,
		})
		return
	}

	const customId = interaction.customId

	if (customId === SS_ID.cancel) {
		drafts.delete(key)
		await interaction.update({
			content: 'Отменено.',
			embeds: [],
			components: [],
		})
		return
	}

	if (customId === SS_ID.back) {
		if (draft.type != null) draft.type = null
		else if (draft.stage != null) draft.stage = null
		await interaction.update(renderStep(draft))
		return
	}

	if (customId.startsWith(SS_DAY_PREFIX)) {
		draft.date = customId.slice(SS_DAY_PREFIX.length)
	} else if (customId.startsWith(SS_STAGE_PREFIX)) {
		draft.stage = Number(customId.slice(SS_STAGE_PREFIX.length))
	} else if (customId.startsWith(SS_TYPE_PREFIX)) {
		draft.type = customId.slice(SS_TYPE_PREFIX.length)
	} else {
		await interaction.reply({
			content: 'Неизвестная кнопка.',
			flags: MessageFlags.Ephemeral,
		})
		return
	}

	if (draft.date == null || draft.stage == null || draft.type == null) {
		await interaction.update(renderStep(draft))
		return
	}

	await interaction.deferUpdate()
	try {
		const data = await uploadScreenshot(draft)
		await interaction.editReply({
			embeds: [successEmbed(draft, data)],
			components: [],
		})
		drafts.delete(key)
	} catch (err) {
		error('Screenshot prompt upload failed:', err)
		await interaction.editReply({
			content: `Ошибка: ${errMsg(err)}`,
			embeds: [],
			components: [],
		})
	}
}