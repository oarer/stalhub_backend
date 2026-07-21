import type { Cookie } from 'elysia'
import { prisma } from '@/lib/prisma'

interface JwtFacade {
	sign(payload: Record<string, unknown>): Promise<string>
	verify(token?: string): Promise<Record<string, unknown> | false>
}

interface AuthContext {
	cookie: { access_token?: Cookie<string | undefined> }
	jwt: JwtFacade
	set: { status?: number | string; headers: Record<string, string | number> }
	store: Record<string, unknown>
}

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

async function isUserBanned(
	userId: number
): Promise<{ banned: boolean; reason?: string | null }> {
	const settings = await prisma.userSettings.findUnique({
		where: { userId },
		select: { banned: true, ban_reason: true, ban_expires_at: true },
	})

	if (!settings || !settings.banned) return { banned: false }

	if (settings.ban_expires_at && settings.ban_expires_at < new Date()) {
		await prisma.userSettings.update({
			where: { userId },
			data: { banned: false, ban_reason: null, ban_expires_at: null },
		})
		return { banned: false }
	}

	return { banned: true, reason: settings.ban_reason }
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
		return { error: 'Account banned', reason: ban.reason }
	}

	store.authUserId = userId
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
