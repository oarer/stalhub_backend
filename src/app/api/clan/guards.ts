import { prisma } from '@/lib/prisma'

const OFFICER_RANKS = new Set(['OFFICER', 'COLONEL', 'LEADER'])

interface ClanGuardContext {
	store: { authUserId?: number; clanId?: string }
	set: { status?: number | string }
}

export async function requireClanMember({ store, set }: ClanGuardContext) {
	const userId = store.authUserId
	if (!userId) {
		set.status = 401
		return { error: 'Unauthorized' }
	}
	const profile = await prisma.userClanProfile.findUnique({
		where: { userId },
		select: { clanId: true },
	})
	if (!profile?.clanId) {
		set.status = 403
		return { error: 'You are not in a clan' }
	}
	store.clanId = profile.clanId
}

export async function requireClanOfficer(ctx: ClanGuardContext) {
	const error = await requireClanMember(ctx)
	if (error) return error

	const { store, set } = ctx
	const profile = await prisma.userClanProfile.findUnique({
		where: { userId: store.authUserId },
		include: { clan: true },
	})
	if (profile?.clan?.status !== 'ACTIVE') {
		set.status = 403
		return { error: 'Clan is not active. Register it first.' }
	}
	const member = await prisma.clanMember.findFirst({
		where: { clanId: store.clanId, userId: store.authUserId },
	})
	const isLeader = profile?.clan?.leader !== ''
	const allowed = (member && OFFICER_RANKS.has(member.rank)) || isLeader
	if (!allowed) {
		set.status = 403
		return { error: 'Officer rank required' }
	}
}

export async function requireClanLeader(ctx: ClanGuardContext) {
	const error = await requireClanMember(ctx)
	if (error) return error

	const { store, set } = ctx
	const member = await prisma.clanMember.findFirst({
		where: { clanId: store.clanId, userId: store.authUserId },
		select: { rank: true },
	})
	if (member?.rank !== 'LEADER') {
		set.status = 403
		return { error: 'Leader rank required' }
	}
}
