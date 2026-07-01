import { prisma } from '@/lib/prisma'

export async function checkPermission(userId: string, permission: string): Promise<boolean> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			roles: {
				include: {
					role: {
						include: {
							permissions: { include: { permission: true } },
						},
					},
				},
			},
		},
	})

	if (!user) return false

	return user.roles.some((r) =>
		r.role.permissions.some((p) => p.permission.name === permission)
	)
}

export function fromStore(store: Record<string, unknown>) {
	return {
		userId: store.authUserId as string,
		sessionId: store.authSessionId as string,
	}
}

export function fromStoreOpt(store: Record<string, unknown>) {
	return {
		userId: store.authUserId as string | undefined,
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

export async function requireAuth({ cookie: { access_token }, jwt, set, store }: any) {
	const payload = await jwt.verify(access_token?.value)
	if (!payload || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
		set.status = 401
		return { error: 'Unauthorized' }
	}
	const valid = await findSession(payload.sid)
	if (!valid) {
		set.status = 401
		return { error: 'Session expired' }
	}
	store.authUserId = payload.sub
	store.authSessionId = payload.sid
}

export async function requireOptionalAuth({ cookie: { access_token }, jwt, store }: any) {
	if (!access_token?.value) return
	const payload = await jwt.verify(access_token.value)
	if (payload && typeof payload.sub === 'string') {
		store.authUserId = payload.sub
	}
}
