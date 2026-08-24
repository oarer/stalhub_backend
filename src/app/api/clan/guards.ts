import { apiClient } from '@/app/interceptors/sc.interceptor'
import { prisma } from '@/lib/prisma'
import { decryptSecretJson } from '@/utils/crypto'

const OFFICER_RANKS = new Set(['OFFICER', 'COLONEL', 'LEADER'])

interface ExboCharacterEntry {
	information: { id: string; name: string }
	clan?: {
		info: { id: string }
		member: { name: string; rank: string }
	}
}

interface ClanGuardContext {
	store: { authUserId?: number; clan_id?: string }
	set: { status?: number | string }
}

export async function requireClanMember({ store, set }: ClanGuardContext) {
	const user_id = store.authUserId
	if (!user_id) {
		set.status = 401
		return { error: 'Unauthorized' }
	}
	const profile = await prisma.userClanProfile.findFirst({
		where: { user_id, is_active: true },
		select: { clan_id: true },
	})
	if (!profile?.clan_id) {
		set.status = 403
		return { error: 'You are not in a clan' }
	}
	store.clan_id = profile.clan_id
}

export async function requireClanOfficer(ctx: ClanGuardContext) {
	const error = await requireClanMember(ctx)
	if (error) return error

	const { store, set } = ctx
	const profile = await prisma.userClanProfile.findFirst({
		where: { user_id: store.authUserId, is_active: true },
		include: { clan: true },
	})
	if (profile?.clan?.status !== 'ACTIVE') {
		set.status = 403
		return { error: 'Clan is not active. Register it first.' }
	}
	const member = await prisma.clanMember.findFirst({
		where: { clan_id: store.clan_id, user_id: store.authUserId },
	})
	const allowed = member && OFFICER_RANKS.has(member.rank)
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
		where: { clan_id: store.clan_id, user_id: store.authUserId },
		select: { rank: true },
	})
	if (member?.rank === 'LEADER') return

	const clan = await prisma.clan.findUnique({
		where: { id: store.clan_id },
		select: { leader: true, region: true },
	})

	const auth = await prisma.eXBOAuth.findUnique({
		where: { userid: store.authUserId },
	})
	if (!auth) {
		set.status = 403
		return { error: 'Leader rank required' }
	}

	if (
		clan?.leader &&
		auth.username.toLowerCase() === clan.leader.toLowerCase()
	) {
		return
	}

	try {
		const { access_token } = decryptSecretJson<{ access_token: string }>(
			auth.token_blob
		)
		const { data: chars } = await apiClient.get<ExboCharacterEntry[]>(
			`/${clan?.region ?? auth.region ?? 'RU'}/characters`,
			{
				headers: { Authorization: `Bearer ${access_token}` },
				_skipAuth: true,
			} as never
		)
		const isLeaderInGame = chars.some(
			(c) =>
				c.clan?.info?.id === store.clan_id &&
				c.clan?.member?.rank === 'LEADER'
		)
		if (isLeaderInGame) return
	} catch {
		// fall through to deny
	}

	set.status = 403
	return { error: 'Leader rank required' }
}
