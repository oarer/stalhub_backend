import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Colors,
	EmbedBuilder,
	ModalBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js'
import { addDays, fmtDate, mskDateStr, mskHour } from '../../lib/msk'
import {
	ABSENCE_DATE_OPTIONS,
	ABSENCE_DEADLINE_MSK_HOUR,
	ABSENCE_EVENT_NAMES,
	ABSENCE_EVENT_ORDER,
	ABSENCE_ID,
	ABSENCE_MAX_STAGES,
	type AbsenceDraft,
	type AbsenceEntry,
} from './types'

function eventLabel(eventType: string): string {
	return ABSENCE_EVENT_NAMES[eventType] ?? eventType
}

function maxStageOf(events: string[]): number {
	return Math.max(...events.map((e) => ABSENCE_MAX_STAGES[e] ?? 0), 0)
}

function formatAbsenceLine(a: AbsenceEntry): string {
	const who = a.user?.name || a.user?.username || '—'
	const events = a.events
		.map(
			(e) =>
				`${eventLabel(e.eventType)}${
					e.stages?.length ? ` (эт. ${e.stages.join(', ')})` : ''
				}`
		)
		.join(', ')
	return `**${who}** — ${events}${a.note ? ` — ${a.note}` : ''}`
}

export function listEmbed(
	clan: { name: string; tag: string },
	date: string,
	absences: AbsenceEntry[]
) {
	const lines = absences.length
		? absences.map(formatAbsenceLine)
		: ['Отписок нет']
	return new EmbedBuilder()
		.setColor(Colors.Blurple)
		.setTitle(`Отписки — ${clan.name}${clan.tag ? ` [${clan.tag}]` : ''}`)
		.setDescription(`${fmtDate(date)}\n\n${lines.join('\n')}`)
}

export function listComponents(date: string) {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(ABSENCE_ID.open(date))
			.setLabel('Оставить отписку')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId(ABSENCE_ID.remove(date))
			.setLabel('Снять отписку')
			.setStyle(ButtonStyle.Secondary)
	)
	return [row]
}

function dateOptions() {
	const today = mskDateStr()
	const firstDay = mskHour() >= ABSENCE_DEADLINE_MSK_HOUR ? 1 : 0
	const options: StringSelectMenuOptionBuilder[] = []
	for (let i = firstDay; i < firstDay + ABSENCE_DATE_OPTIONS; i++) {
		const d = addDays(today, i)
		const label = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : fmtDate(d)
		options.push(
			new StringSelectMenuOptionBuilder()
				.setLabel(`${label} · ${d}`)
				.setValue(d)
		)
	}
	return options
}

function eventOptions(selected: string[]) {
	return ABSENCE_EVENT_ORDER.map((e) =>
		new StringSelectMenuOptionBuilder()
			.setLabel(eventLabel(e))
			.setValue(e)
			.setDescription(
				ABSENCE_MAX_STAGES[e]
					? `до ${ABSENCE_MAX_STAGES[e]} этапов`
					: 'без этапов'
			)
			.setDefault(selected.includes(e))
	)
}

function stageOptions(draft: AbsenceDraft) {
	const options: StringSelectMenuOptionBuilder[] = []
	for (let i = 1; i <= maxStageOf(draft.events); i++) {
		options.push(
			new StringSelectMenuOptionBuilder()
				.setLabel(`Этап ${i}`)
				.setValue(String(i))
				.setDefault(draft.stages.includes(i))
		)
	}
	if (!options.length) {
		options.push(
			new StringSelectMenuOptionBuilder()
				.setLabel('Выберите событие')
				.setValue('0')
				.setDefault(false)
		)
	}
	return options
}

export function formEmbed(draft: AbsenceDraft) {
	const eventsText = draft.events.length
		? draft.events.map(eventLabel).join(', ')
		: 'не выбраны'
	const stagesText = draft.stages.length
		? draft.stages.map(String).join(', ')
		: '—'
	return new EmbedBuilder()
		.setColor(Colors.Blurple)
		.setTitle('Оставить отписку')
		.setDescription(
			'Выберите дату, события и этапы. При необходимости добавьте комментарий и нажмите «Сохранить».'
		)
		.addFields(
			{ name: 'Дата', value: fmtDate(draft.date), inline: true },
			{ name: 'События', value: eventsText, inline: true },
			{ name: 'Этапы', value: stagesText, inline: true },
			{ name: 'Комментарий', value: draft.note || '—' }
		)
}

export function formComponents(draft: AbsenceDraft) {
	const maxStage = maxStageOf(draft.events)
	const dateRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(ABSENCE_ID.date)
				.setPlaceholder('Дата')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(dateOptions())
		)
	const eventRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(ABSENCE_ID.event)
				.setPlaceholder('События')
				.setMinValues(1)
				.setMaxValues(ABSENCE_EVENT_ORDER.length)
				.addOptions(eventOptions(draft.events))
		)
	const stageRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(ABSENCE_ID.stages)
				.setPlaceholder(
					draft.events.length
						? 'Этапы (можно пропустить)'
						: 'Сначала выберите событие'
				)
				.setMinValues(1)
				.setMaxValues(maxStage || 1)
				.setDisabled(!maxStage)
				.addOptions(stageOptions(draft))
		)
	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(ABSENCE_ID.note)
			.setLabel('Комментарий')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(ABSENCE_ID.save)
			.setLabel('Сохранить')
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId(ABSENCE_ID.cancel)
			.setLabel('Отмена')
			.setStyle(ButtonStyle.Secondary)
	)
	return [dateRow, eventRow, stageRow, actionRow]
}

export function noteModal(currentNote: string) {
	const input = new TextInputBuilder()
		.setCustomId(ABSENCE_ID.noteInput)
		.setLabel('Комментарий к отписке')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setMaxLength(500)
	if (currentNote) input.setValue(currentNote)
	return new ModalBuilder()
		.setCustomId(ABSENCE_ID.note)
		.setTitle('Комментарий к отписке')
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(input)
		)
}

export function saveSuccessEmbed(draft: AbsenceDraft) {
	const eventsText = draft.events.map(eventLabel).join(', ')
	let desc = `${fmtDate(draft.date)} — **${eventsText}**`
	if (draft.stages.length) desc += `\nЭтапы: ${draft.stages.join(', ')}`
	if (draft.note) desc += `\nКомментарий: ${draft.note}`
	return new EmbedBuilder()
		.setColor(Colors.Green)
		.setTitle('Отписка сохранена')
		.setDescription(desc)
}

export function removeSuccessEmbed(date: string) {
	return new EmbedBuilder()
		.setColor(Colors.Green)
		.setTitle('Отписка снята')
		.setDescription(`Отписка на ${fmtDate(date)} удалена.`)
}

export function removeErrorEmbed(message: string) {
	return new EmbedBuilder()
		.setColor(Colors.Red)
		.setTitle('Не удалось снять отписку')
		.setDescription(message)
}

export function removeConfirmEmbed(date: string) {
	return new EmbedBuilder()
		.setColor(Colors.Red)
		.setTitle('Снять отписку')
		.setDescription(`Удалить вашу отписку на **${fmtDate(date)}**?`)
}

export function removeConfirmComponents() {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(ABSENCE_ID.removeConfirm)
			.setLabel('Да, снять отписку')
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setCustomId(ABSENCE_ID.removeCancel)
			.setLabel('Отмена')
			.setStyle(ButtonStyle.Secondary)
	)
	return [row]
}
