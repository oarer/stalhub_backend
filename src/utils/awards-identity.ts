import { prisma } from '@/lib/prisma'

export interface AwardsIdentityContext {
	cookie: { access_token?: { value?: string } }
	jwt: {
		verify(token?: string): Promise<Record<string, unknown> | false>
	}
}

async function sessionUserId(
	ctx: AwardsIdentityContext
): Promise<number | undefined> {
	const token = ctx.cookie.access_token?.value
	if (!token) return undefined
	const payload = await ctx.jwt.verify(token)
	if (
		!payload ||
		typeof payload.sub !== 'string' ||
		typeof payload.sid !== 'string'
	)
		return undefined
	const user_id = Number(payload.sub)
	if (!Number.isSafeInteger(user_id) || user_id <= 0) return undefined
	const session = await prisma.sessions.findUnique({
		where: { session_id: payload.sid },
		select: { user_id: true, revoked: true },
	})
	if (!session || session.revoked || session.user_id !== user_id)
		return undefined
	return user_id
}

export async function resolveAwardsUserId(
	ctx: AwardsIdentityContext
): Promise<number | undefined> {
	const user_id = await sessionUserId(ctx)
	if (user_id === undefined) return undefined
	const settings = await prisma.userSettings.findUnique({
		where: { user_id },
		select: { banned: true, ban_expires_at: true },
	})
	if (
		settings?.banned &&
		(!settings.ban_expires_at || settings.ban_expires_at > new Date())
	)
		return undefined
	return user_id
}

export async function resolveAwardsActor(
	ctx: AwardsIdentityContext
): Promise<number> {
	const user_id = await sessionUserId(ctx)
	if (user_id === undefined) throw { status: 401, code: 'unauthorized' }
	return user_id
}
