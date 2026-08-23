import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'

export async function assignDefaultRole(user_id: number) {
	const role = await prisma.role.upsert({
		where: { name: 'user' },
		update: {},
		create: {
			name: 'user',
			description: 'Default user role',
		},
	})

	await prisma.user.update({
		where: { id: user_id },
		data: { roles: { connect: { id: role.id } } },
	})
}

export async function createSession(
	user_id: number,
	userAgent: string,
	ip: string
) {
	const session_id = crypto.randomUUID()

	const session = await prisma.sessions.create({
		data: {
			session_id,
			user_id,
			user_agent: userAgent.slice(0, 500),
			ip: ip.slice(0, 45),
		},
	})

	return session
}

export type SessionWithFullUser = Prisma.SessionsGetPayload<{
	include: {
		user: {
			include: {
				user_settings: true
				badges: true
				discord_auth: true
				telegram_auth: true
				exbo_auth: true
				roles: true
				customization: true
			}
		}
	}
}>

export type SessionWithRoles = Prisma.SessionsGetPayload<{
	include: {
		user: {
			include: {
				roles: true
			}
		}
	}
}>

class AuthService {
	async getSession(session_id: string): Promise<SessionWithFullUser | null> {
		const session = await prisma.sessions.findUnique({
			where: { session_id },
			include: {
				user: {
					include: {
						user_settings: true,
						badges: true,
						discord_auth: true,
						telegram_auth: true,
						exbo_auth: true,
						roles: true,
						customization: true,
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
		session_id: string
	): Promise<SessionWithRoles | null> {
		const session = await prisma.sessions.findUnique({
			where: { session_id },
			include: {
				user: {
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
		const u = session.user

		return {
			id: u.id,
			username: u.username,
			username_changed_at: u.username_changed_at,
			name: u.name,
			joined_at: u.joined_at,
			onboarded: u.onboarded,
			social_links: u.social_links ?? null,

			settings: u.user_settings ?? null,
			badges: u.badges ?? [],
			roles: u.roles,

			providers: {
				discord: u.discord_auth
					? {
							id: u.discord_auth.discord_id,
							name: u.discord_auth.name,
							username: u.discord_auth.username,
						}
					: null,

				telegram: u.telegram_auth
					? {
							id: u.telegram_auth.telegram_id,
							name: u.telegram_auth.name,
							username: u.telegram_auth.login,
						}
					: null,

				exbo: u.exbo_auth
					? {
							id: u.exbo_auth.exbo_id,
							login: u.exbo_auth.login,
							username: u.exbo_auth.username,
							region: u.exbo_auth.region
						}
					: null,
			},

			customization:
				u.customization ?? {
					layout: 'CLASSIC',
					banner_mode: 'NONE',
					banner_type: 'HEADER',
					banner_color: '#171717',
					banner_image: null,
					card_background: 'NONE',
					card_color: '#171717',
					avatar: null,
				},
		}
	}

	async revokeSession(session_id: string) {
		await prisma.sessions.updateMany({
			where: { session_id },
			data: { revoked: true },
		})
	}

	async deleteUserSessions(user_id: number) {
		await prisma.sessions.deleteMany({
			where: { user_id },
		})
	}
}

export const authService = new AuthService()
