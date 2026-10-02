import { t } from 'elysia'
import { prisma } from '@/lib/prisma'
import { fromStore, requireAuth } from '@/utils/auth.guard'
import { hashPassword, verifyPassword } from '@/utils/crypto'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'

const LOGIN_PATTERN = '^[a-zA-Z0-9_]+$'
const USERNAME_COOLDOWN_DAYS = 30
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

const loginSchema = t.String({
	minLength: 3,
	maxLength: 32,
	pattern: LOGIN_PATTERN,
})

async function requireExboUser(user_id: number) {
	const user = await prisma.user.findUnique({
		where: { id: user_id },
		select: {
			id: true,
			username: true,
			username_changed_at: true,
			password_hash: true,
			exbo_auth: { select: { id: true } },
		},
	})
	if (!user || !user.exbo_auth) return null
	return user
}

async function isLoginTaken(login: string, excludeUserId: number) {
	const taken = await prisma.user.findFirst({
		where: {
			username: { equals: login, mode: 'insensitive' },
			id: { not: excludeUserId },
		},
		select: { id: true },
	})
	return !!taken
}

function usernameCooldownError(username_changed_at: Date) {
	const daysSince = Math.floor(
		(Date.now() - username_changed_at.getTime()) / (1000 * 60 * 60 * 24)
	)
	if (daysSince < USERNAME_COOLDOWN_DAYS) {
		const daysLeft = USERNAME_COOLDOWN_DAYS - daysSince
		return `Username can be changed once every ${USERNAME_COOLDOWN_DAYS} days. ${daysLeft} days remaining.`
	}
	return null
}

export const exboCredentials = createElysia()
	.use(jwtPlugin)
	.group('/exbo/credentials', (app) =>
	app
		// Статус локальных реквизитов: какой логин и задан ли пароль.
		.get(
			'/',
			async ({ store, set }) => {
				const { user_id } = fromStore(store)
				const user = await requireExboUser(user_id)
				if (!user) {
					set.status = 404
					return { error: 'EXBO account is not linked' }
				}
				return {
					login: user.username,
					has_password: !!user.password_hash,
				}
			},
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Auth: Exbo'] },
			}
		)

		// Первичная установка: юзер сам задаёт логин (опционально) + пароль.
		// Только для аккаунтов с привязанным EXBO. Повторный вызов -> 409.
		.post(
			'/',
			async ({ body, store, set }) => {
				const { user_id } = fromStore(store)
				const user = await requireExboUser(user_id)
				if (!user) {
					set.status = 404
					return { error: 'EXBO account is not linked' }
				}
				if (user.password_hash) {
					set.status = 409
					return {
						error: 'Password already set, use PATCH to change it',
					}
				}

				const data: {
					username?: string
					username_changed_at?: Date
					password_hash?: string
				} = {}

				if (body.login !== undefined && body.login !== user.username) {
					if (await isLoginTaken(body.login, user_id)) {
						set.status = 409
						return { error: 'Username is already taken' }
					}
					data.username = body.login
					data.username_changed_at = new Date()
				}

				data.password_hash = hashPassword(body.password)

				const updated = await prisma.user.update({
					where: { id: user_id },
					data,
					select: { username: true },
				})

				return { success: true, login: updated.username }
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					login: t.Optional(loginSchema),
					password: t.String({
						minLength: PASSWORD_MIN,
						maxLength: PASSWORD_MAX,
					}),
				}),
				detail: { tags: ['Auth: Exbo'] },
			}
		)

		// Смена логина и/или пароля. Хотя бы одно поле обязательно.
		.patch(
			'/',
			async ({ body, store, set }) => {
				const { user_id, session_id } = fromStore(store)
				const user = await requireExboUser(user_id)
				if (!user) {
					set.status = 404
					return { error: 'EXBO account is not linked' }
				}
				if (body.login === undefined && body.new_password === undefined) {
					set.status = 400
					return { error: 'Nothing to update' }
				}

				const data: {
					username?: string
					username_changed_at?: Date
					password_hash?: string
				} = {}

				if (body.login !== undefined && body.login !== user.username) {
					const cooldown = usernameCooldownError(
						user.username_changed_at
					)
					if (cooldown) {
						set.status = 400
						return { error: cooldown }
					}
					if (await isLoginTaken(body.login, user_id)) {
						set.status = 409
						return { error: 'Username is already taken' }
					}
					data.username = body.login
					data.username_changed_at = new Date()
				}

				if (body.new_password !== undefined) {
					if (user.password_hash) {
						if (!body.current_password) {
							set.status = 400
							return { error: 'Current password required' }
						}
						if (
							!verifyPassword(
								body.current_password,
								user.password_hash
							)
						) {
							set.status = 401
							return { error: 'Invalid current password' }
						}
					}
					data.password_hash = hashPassword(body.new_password)
				}

				if (Object.keys(data).length === 0) {
					return { success: true, login: user.username }
				}

				const updated = await prisma.user.update({
					where: { id: user_id },
					data,
					select: { username: true },
				})

				// Смена пароля выкидывает все остальные сессии.
				if (data.password_hash) {
					await prisma.sessions.updateMany({
						where: {
							user_id,
							session_id: { not: session_id },
							revoked: false,
						},
						data: { revoked: true },
					})
				}

				return { success: true, login: updated.username }
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					current_password: t.Optional(t.String({ minLength: 1 })),
					login: t.Optional(loginSchema),
					new_password: t.Optional(
						t.String({
							minLength: PASSWORD_MIN,
							maxLength: PASSWORD_MAX,
						})
					),
				}),
				detail: { tags: ['Auth: Exbo'] },
			}
		)

		// Отключение входа по паролю (удаление password_hash).
		.delete(
			'/',
			async ({ body, store, set }) => {
				const { user_id, session_id } = fromStore(store)
				const user = await requireExboUser(user_id)
				if (!user) {
					set.status = 404
					return { error: 'EXBO account is not linked' }
				}
				if (!user.password_hash) {
					set.status = 404
					return { error: 'Password login is not enabled' }
				}
				if (
					body?.current_password &&
					!verifyPassword(body.current_password, user.password_hash)
				) {
					set.status = 401
					return { error: 'Invalid current password' }
				}

				await prisma.user.update({
					where: { id: user_id },
					data: { password_hash: null },
				})
				await prisma.sessions.updateMany({
					where: {
						user_id,
						session_id: { not: session_id },
						revoked: false,
					},
					data: { revoked: true },
				})

				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				body: t.Optional(
					t.Object({
						current_password: t.Optional(
							t.String({ minLength: 1 })
						),
					})
				),
				detail: { tags: ['Auth: Exbo'] },
			}
		)
)
