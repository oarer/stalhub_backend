/**
 * Общие select-фрагменты пользователя с бейджами.
 * Бейджи нужны фронту для эффектов ника (партиклы в цвете бейджа),
 * поэтому прокидываем их во всех авторских/юзерных селектах списков.
 */
export const USER_BADGES_SELECT = {
	id: true,
	name: true,
	icon: true,
	image: true,
	color: true,
} as const

/** Автор контента: id + name + username + бейджи. */
export const AUTHOR_WITH_BADGES_SELECT = {
	id: true,
	name: true,
	username: true,
	badges: { select: USER_BADGES_SELECT },
} as const

/** Пользователь (участники, инвайты, заметки): id + username + name + бейджи. */
export const USER_WITH_BADGES_SELECT = {
	id: true,
	username: true,
	name: true,
	badges: { select: USER_BADGES_SELECT },
} as const
