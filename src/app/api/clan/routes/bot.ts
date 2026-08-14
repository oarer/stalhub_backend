import { t } from 'elysia'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { requireClanMember, requireClanOfficer } from '../guards'

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TOKEN_LENGTH = 8
const TOKEN_TTL_MS = 10 * 60 * 1000

function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH))
	return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('')
}

const guildSelect = {
	guild_id: true,
	clan_id: true,
	allowed_role_id: true,
	publish_time: true,
	publish_channel_id: true,
	linked_by: true,
	created_at: true,
} as const

export const clanBotRoutes = clanContext
	.post(
		'/bot/link-token',
		async ({ store }) => {
			const clanId = store.clanId!
			const token = generateToken()
			await prisma.botLinkState.create({
				data: {
					token,
					clan_id: clanId,
					user_id: store.authUserId,
					expires_at: new Date(Date.now() + TOKEN_TTL_MS),
				},
			})
			return {
				token,
				expires_in: TOKEN_TTL_MS / 1000,
				command: `/setup ${token}`,
			}
		},
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			detail: { tags: ['Clan'] },
		}
	)
	.get(
		'/bot/guilds',
		async ({ store }) => {
			const guilds = await prisma.botGuild.findMany({
				where: { clan_id: store.clanId },
				select: guildSelect,
				orderBy: { created_at: 'asc' },
			})
			return { guilds }
		},
		{
			beforeHandle: [requireAuth, requireClanMember],
			detail: { tags: ['Clan'] },
		}
	)
	.delete(
		'/bot/guilds/:guildId',
		async ({ store, params, set }) => {
			const guild = await prisma.botGuild.findFirst({
				where: { guild_id: params.guildId, clan_id: store.clanId },
			})
			if (!guild) {
				set.status = 404
				return { error: 'Guild not linked to this clan' }
			}
			await prisma.botGuild.delete({ where: { guild_id: params.guildId } })
			return { success: true }
		},
		{
			beforeHandle: [requireAuth, requireClanOfficer],
			params: t.Object({ guildId: t.String() }),
			detail: { tags: ['Clan'] },
		}
	)
