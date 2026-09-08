import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Colors,
	EmbedBuilder,
} from 'discord.js'
import { addDays, fmtDate, mskDateStr } from '../../lib/msk'
import {
	SS_DAY_OPTIONS,
	SS_ID,
	SS_STAGE_MAX,
	SS_TYPES,
	type ScreenshotDraft,
} from './types'

function fieldText(v: string | number | null, placeholder: string): string {
	return v == null ? placeholder : String(v)
}

export function promptEmbed(draft: ScreenshotDraft) {
	const step =
		draft.date == null ? 0 : draft.stage == null ? 1 : 2
	const prompts = [
		'Выберите **день** события',
		'Выберите **этап**',
		'Выберите **тип** события',
	][step]
	return new EmbedBuilder()
		.setColor(Colors.Blurple)
		.setTitle('Уточнение параметров скриншота')
		.setDescription(
			`Не удалось определить событие по времени — этапы уже завершились.\n\n${prompts}`
		)
		.addFields(
			{ name: 'День', value: fieldText(draft.date, '—'), inline: true },
			{ name: 'Этап', value: fieldText(draft.stage, '—'), inline: true },
			{ name: 'Тип', value: fieldText(draft.type, '—'), inline: true }
		)
}

export function promptComponents(draft: ScreenshotDraft) {
	const cancel = new ButtonBuilder()
		.setCustomId(SS_ID.cancel)
		.setLabel('Отмена')
		.setStyle(ButtonStyle.Danger)

	if (draft.date == null) {
		const today = mskDateStr()
		const dayButtons: ButtonBuilder[] = []
		for (let i = 0; i < SS_DAY_OPTIONS; i++) {
			const d = addDays(today, -i)
			const label =
				i === 0 ? 'Сегодня' : i === 1 ? 'Вчера' : fmtDate(d)
			dayButtons.push(
				new ButtonBuilder()
					.setCustomId(SS_ID.day(d))
					.setLabel(label)
					.setStyle(ButtonStyle.Primary)
			)
		}
		return [
			new ActionRowBuilder<ButtonBuilder>().addComponents(...dayButtons),
			new ActionRowBuilder<ButtonBuilder>().addComponents(cancel),
		]
	}

	if (draft.stage == null) {
		const stageButtons: ButtonBuilder[] = []
		for (let i = 1; i <= SS_STAGE_MAX; i++) {
			stageButtons.push(
				new ButtonBuilder()
					.setCustomId(SS_ID.stage(i))
					.setLabel(`Этап ${i}`)
					.setStyle(ButtonStyle.Primary)
			)
		}
		return [
			new ActionRowBuilder<ButtonBuilder>().addComponents(...stageButtons),
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(SS_ID.back)
					.setLabel('Назад')
					.setStyle(ButtonStyle.Secondary),
				cancel
			),
		]
	}

	const typeButtons = SS_TYPES.map((t) =>
		new ButtonBuilder()
			.setCustomId(SS_ID.type(t.value))
			.setLabel(t.label)
			.setStyle(ButtonStyle.Primary)
	)
	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(...typeButtons),
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(SS_ID.back)
				.setLabel('Назад')
				.setStyle(ButtonStyle.Secondary),
			cancel
		),
	]
}

export function successEmbed(draft: ScreenshotDraft, data: {
	session: { id: number; map_name: string }
	screenshot: { id: number }
}) {
	const typeLabel =
		SS_TYPES.find((t) => t.value === draft.type)?.label ?? draft.type ?? '—'
	return new EmbedBuilder()
		.setColor(Colors.Green)
		.setTitle('Скриншот загружен')
		.setDescription(
			`Сессия **#${data.session.id}** (${data.session.map_name}), скрин **#${data.screenshot.id}**`
		)
		.addFields(
			{ name: 'День', value: fmtDate(draft.date ?? ''), inline: true },
			{ name: 'Этап', value: String(draft.stage), inline: true },
			{ name: 'Тип', value: typeLabel, inline: true }
		)
}