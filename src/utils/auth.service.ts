import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'

export async function assignDefaultRole(userId: number) {
	const role = await prisma.role.upsert({
		where: { name: 'user' },
		update: {},
		create: {
			name: 'user',
			description: 'Default user role',
		},
	})

	await prisma.user.update({
		where: { id: userId },
		data: { roles: { connect: { id: role.id } } },
	})
}

export async function createSession(userId: number, userAgent: string, ip: string) {
	const sessionId = crypto.randomUUID()

	const session = await prisma.sessions.create({
		data: {
			sessionId,
			userId,
			User_Agent: userAgent.slice(0, 500),
			ip: ip.slice(0, 45),
		},
	})

	return session
}

export type SessionWithFullUser = Prisma.SessionsGetPayload<{
	include: {
		User: {
			include: {
				UserSettings: true
				badges: true
				DiscordAuth: true
				TelegramAuth: true
				EXBOAuth: true
				roles: true
			}
		}
	}
}>

export type SessionWithRoles = Prisma.SessionsGetPayload<{
	include: {
		User: {
			include: {
				roles: true
			}
		}
	}
}>

class AuthService {
	async getSession(sessionId: string): Promise<SessionWithFullUser | null> {
		const session = await prisma.sessions.findUnique({
			where: { sessionId },
			include: {
				User: {
					include: {
						UserSettings: true,
						badges: true,
						DiscordAuth: true,
						TelegramAuth: true,
						EXBOAuth: true,
						roles: true,
					},
				},
			},
		})

		if (!session || session.revoked) return null

		await prisma.sessions.update({
			where: { id: session.id },
			data: { last_used_at: new Date() },
		})

		return session
	}

	async getSessionWithRoles(
		sessionId: string
	): Promise<SessionWithRoles | null> {
		const session = await prisma.sessions.findUnique({
			where: { sessionId },
			include: {
				User: {
					include: {
						roles: true,
					},
				},
			},
		})

		if (!session || session.revoked) return null

		return session
	}

	userPayload(session: SessionWithFullUser) {
		const u = session.User

		return {
			id: u.id,
			username: u.username,
			name: u.name,
			joined_at: u.joined_at,

			settings: u.UserSettings ?? null,
			badges: u.badges ?? [],
			roles: u.roles,

			providers: {
				discord: u.DiscordAuth
					? {
							id: u.DiscordAuth.discord_id,
							name: u.DiscordAuth.name,
							username: u.DiscordAuth.username,
						}
					: null,

				telegram: u.TelegramAuth
					? {
							id: u.TelegramAuth.telegram_id,
							name: u.TelegramAuth.name,
							username: u.TelegramAuth.login,
						}
					: null,

				exbo: u.EXBOAuth
					? {
							id: u.EXBOAuth.exbo_id,
							login: u.EXBOAuth.login,
							username: u.EXBOAuth.username,
						}
					: null,
			},
		}
	}

	async revokeSession(sessionId: string) {
		await prisma.sessions.updateMany({
			where: { sessionId },
			data: { revoked: true },
		})
	}

	async deleteUserSessions(userId: number) {
		await prisma.sessions.deleteMany({
			where: { userId },
		})
	}
}

export const authService = new AuthService()
