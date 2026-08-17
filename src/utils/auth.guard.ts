import type { Cookie } from 'elysia'
import { prisma } from '@/lib/prisma'

interface JwtFacade {
	sign(payload: Record<string, unknown>): Promise<string>
	verify(token?: string): Promise<Record<string, unknown> | false>
}

interface AuthContext {
	cookie: {
		access_token?: Cookie<string | undefined>
		refresh_token?: Cookie<string | undefined>
	}
	jwt: JwtFacade
	set: { status?: number | string; headers: Record<string, string | number> }
	store: Record<string, unknown>
	request: Request
}

export type { AuthContext }

const GUEST_ALLOWED_PREFIXES = [
	'/api/v1/auth/',
	'/api/v1/clan/',
	'/api/v1/users/@me',
	'/api/v1/health',
]

export async function checkPermission(
	userId: number,
	permission: string
): Promise<boolean> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			roles: {
				include: {
					permissions: { select: { name: true } },
				},
			},
		},
	})

	if (!user) return false

	return user.roles.some((r) =>
		r.permissions.some((p) => p.name === permission)
	)
}

export async function checkRole(
	userId: number,
	role: string
): Promise<boolean> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: { roles: { select: { name: true } } },
	})

	if (!user) return false

	return user.roles.some((r) => r.name === role)
}

export function fromStore(store: Record<string, unknown>) {
	return {
		userId: store.authUserId as number,
		sessionId: store.authSessionId as string,
	}
}

// requireOptionalAuth
export function fromStoreOpt(store: Record<string, unknown>) {
	return {
		userId: store.authUserId as number | undefined,
		sessionId: store.authSessionId as string | undefined,
	}
}

async function findSession(sessionId: string) {
	const session = await prisma.sessions.findUnique({
		where: { sessionId },
		select: { id: true, revoked: true },
	})
	return session !== null && !session.revoked
}

async function isUserBanned(userId: number) {
	const settings = await prisma.userSettings.findUnique({
		where: { userId },
		select: {
			banned: true,
			ban_reason: true,
			ban_expires_at: true,
		},
	})

	if (!settings || !settings.banned) {
		return { banned: false }
	}

	if (settings.ban_expires_at && settings.ban_expires_at < new Date()) {
		await prisma.userSettings.update({
			where: { userId },
			data: {
				banned: false,
				ban_reason: null,
				ban_expires_at: null,
			},
		})

		return { banned: false }
	}

	return {
		banned: true,
		reason: settings.ban_reason,
		expire_in: settings.ban_expires_at
			? settings.ban_expires_at.getTime() - Date.now()
			: null,
	}
}
export async function requireAdmin({ store, set }: AuthContext) {
	const ok = await checkPermission(store.authUserId as number, 'user:manage')
	if (!ok) {
		set.status = 403
		return { error: 'Forbidden' }
	}
}

export async function requireAuth({
	cookie: { access_token },
	jwt,
	set,
	store,
	request,
}: AuthContext) {
	const payload = await jwt.verify(access_token?.value)
	if (
		!payload ||
		typeof payload.sub !== 'string' ||
		typeof payload.sid !== 'string'
	) {
		set.status = 401
		return { error: 'Unauthorized' }
	}
	const userId = Number(payload.sub)
	const valid = await findSession(payload.sid)
	if (!valid) {
		set.status = 401
		return { error: 'Session expired' }
	}

	const ban = await isUserBanned(userId)
	if (ban.banned) {
		set.status = 403
		return {
			error: 'Account banned',
			reason: ban.reason,
			expire_in: ban.expire_in,
		}
	}

	store.authUserId = userId
	store.authSessionId = payload.sid

	const isGuest =
		Array.isArray(payload.role) && payload.role.includes('clan_guest')
	store.isGuest = isGuest
	if (isGuest) {
		const path = new URL(request.url).pathname
		const allowed = GUEST_ALLOWED_PREFIXES.some((p) => path.startsWith(p))
		if (!allowed) {
			set.status = 403
			return { error: 'Guest access is limited to clan features' }
		}
	}
}

export async function requireRefreshAuth({
	cookie: { refresh_token },
	jwt,
	set,
	store,
}: AuthContext) {
	const payload = await jwt.verify(refresh_token?.value)
	if (
		!payload ||
		typeof payload.sub !== 'string' ||
		typeof payload.sid !== 'string'
	) {
		set.status = 401
		return { error: 'Unauthorized' }
	}
	store.authUserId = Number(payload.sub)
	store.authSessionId = payload.sid
}

export async function requireOptionalAuth({
	cookie: { access_token },
	jwt,
	store,
}: Omit<AuthContext, 'set'>) {
	if (!access_token?.value) return
	const payload = await jwt.verify(access_token.value)
	if (payload && typeof payload.sub === 'string') {
		store.authUserId = Number(payload.sub)
	}
}
