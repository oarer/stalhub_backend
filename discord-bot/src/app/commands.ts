export type LocalizationMap = Record<string, string>

export interface CommandDefinition {
	name: string
	name_localizations?: LocalizationMap
	description: string
	description_localizations?: LocalizationMap
	type?: number
	options?: Array<{
		type: number
		name: string
		name_localizations?: LocalizationMap
		description: string
		description_localizations?: LocalizationMap
		required?: boolean
		choices?: Array<{
			name: string
			name_localizations?: LocalizationMap
			value: string | number
		}>
		min_value?: number
	}>
}

const OPT_STRING = 3
const OPT_INTEGER = 4
const OPT_ATTACHMENT = 11

export const commandDefinitions: CommandDefinition[] = [
	{
		name: 'ping',
		name_localizations: { ru: 'пинг' },
		description: 'Ping',
		description_localizations: { ru: 'Пинг' },
	},
	{
		name: 'setup',
		name_localizations: { ru: 'настройка' },
		description:
			'Link a clan and configure the bot (access role, squad publishing)',
		description_localizations: {
			ru: 'Привязать клан и настроить бота (роль доступа, публикация отрядов)',
		},
		options: [
			{
				type: OPT_STRING,
				name: 'token',
				name_localizations: { ru: 'токен' },
				description: 'Link token from the website',
				description_localizations: { ru: 'Токен привязки с сайта' },
			},
		],
	},
	{
		name: 'publish-squads',
		name_localizations: { ru: 'отряды' },
		description: 'Publish squads to the current channel',
		description_localizations: {
			ru: 'Опубликовать отряды в текущий канал',
		},
	},
	{
		name: 'absence',
		name_localizations: { ru: 'отписки' },
		description: 'Clan absences: view, add and remove',
		description_localizations: {
			ru: 'Отписки клана: просмотр, добавление и снятие',
		},
		options: [
			{
				type: OPT_STRING,
				name: 'date',
				name_localizations: { ru: 'дата' },
				description: 'Date YYYY-MM-DD (default: today)',
				description_localizations: {
					ru: 'Дата YYYY-MM-DD (по умолчанию: сегодня)',
				},
			},
		],
	},
	{
		name: 'screenshot',
		name_localizations: { ru: 'скриншот' },
		description: 'Send screenshots',
		description_localizations: { ru: 'Отправка скриншотов' },
		options: [
			{
				type: OPT_ATTACHMENT,
				name: 'image',
				name_localizations: { ru: 'изображение' },
				description: 'Screenshot image',
				description_localizations: { ru: 'Изображение скриншота' },
				required: true,
			},
			{
				type: OPT_STRING,
				name: 'type',
				name_localizations: { ru: 'тип' },
				description: 'Event type (auto-detect if omitted)',
				description_localizations: {
					ru: 'Тип события (авто-определение, если не указан)',
				},
				required: false,
				choices: [
					{
						name: 'Tournament',
						name_localizations: { ru: 'Турнир' },
						value: 'TOURNAMENT',
					},
					{
						name: 'Brawl',
						name_localizations: { ru: 'Потасовка' },
						value: 'BRAWL',
					},
					{
						name: 'Base Capture',
						name_localizations: { ru: 'Захват базы' },
						value: 'BASE_CAPTURE',
					},
				],
			},
			{
				type: OPT_INTEGER,
				name: 'stage',
				name_localizations: { ru: 'этап' },
				description: 'Stage number (auto-detect if omitted)',
				description_localizations: {
					ru: 'Номер этапа (авто-определение, если не указан)',
				},
				required: false,
				min_value: 1,
			},
			{
				type: OPT_STRING,
				name: 'date',
				name_localizations: { ru: 'дата' },
				description: 'Date YYYY-MM-DD (default: today)',
				description_localizations: {
					ru: 'Дата YYYY-MM-DD (по умолчанию: сегодня)',
				},
			},
		],
	},
	{
		name: 'join',
		name_localizations: { ru: 'войти' },
		description: 'Activate a clan guest access code',
		description_localizations: { ru: 'Активировать код гостевого доступа' },
		options: [
			{
				type: OPT_STRING,
				name: 'code',
				name_localizations: { ru: 'код' },
				description: 'Guest access code',
				description_localizations: { ru: 'Код гостевого доступа' },
				required: true,
			},
		],
	},
]
