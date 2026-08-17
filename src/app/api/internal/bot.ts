import { t } from 'elysia'
import { StageType } from 'generated/prisma/enums'
import { absenceService } from '@/app/api/clan/services/absence'
import { analyticsService } from '@/app/api/clan/services/analytics'
import { clanInviteService } from '@/app/api/clan/services/invites'
import { squadService } from '@/app/api/clan/services/squad'
import { env } from '@/env'
import { mskDate } from '@/lib/msk'
import { prisma } from '@/lib/prisma'
import { detectStageSlot, nextStageSlot } from '@/lib/stages'
import { createElysia } from '@/utils/elysia'

function botAuth({
	headers,
	set,
}: {
	headers: unknown
	set: { status?: number | string }
}) {
	const secret =
		(headers as Record<string, string | undefined>)['x-bot-secret'] ?? ''
	if (
		!env.DISCORD_BOT_SERVICE_JWT ||
		secret !== env.DISCORD_BOT_SERVICE_JWT
	) {
		set.status = 401
		return { error: 'Invalid bot secret' }
	}
}

const guildSelect = {
	guild_id: true,
	clan_id: true,
	allowed_role_id: true,
	publish_time: true,
	publish_channel_id: true,
	stages_channel_id: true,
	linked_by: true,
} as const

async function guildWithClan(guildId: string) {
	const guild = await prisma.botGuild.findUnique({
		where: { guild_id: guildId },
		select: guildSelect,
	})
	if (!guild) return null
	const clan = await prisma.clan.findUnique({
		where: { id: guild.clan_id },
		select: { id: true, name: true, tag: true, region: true },
	})
	return { ...guild, clan }
}

const botRoutes = createElysia().group('/internal/bot', (app) =>
	app
		.get(
			'/clans',
			async ({ query }) => {
				const q = query.q ?? ''
				const clans = await prisma.clan.findMany({
					where: {
						OR: [
							{ id: { contains: q, mode: 'insensitive' } },
							{ name: { contains: q, mode: 'insensitive' } },
							{ tag: { contains: q, mode: 'insensitive' } },
						],
					},
					select: {
						id: true,
						name: true,
						tag: true,
						region: true,
						status: true,
						member_count: true,
					},
					orderBy: { name: 'asc' },
					take: 20,
				})
				return { clans }
			},
			{
				beforeHandle: [botAuth],
				query: t.Object({ q: t.Optional(t.String()) }),
				detail: { tags: ['Internal'] },
			}
		)
		.get(
			'/users/:discordId/clan',
			async ({ params }) => {
				const auth = await prisma.discordAuth.findUnique({
					where: { discord_id: params.discordId },
					select: { userid: true },
				})
				if (!auth) return { clan: null }
				const profile = await prisma.userClanProfile.findUnique({
					where: { userId: auth.userid },
					include: {
						clan: {
							select: {
								id: true,
								name: true,
								tag: true,
								region: true,
								status: true,
							},
						},
					},
				})
				return { clan: profile?.clan ?? null }
			},
			{
				beforeHandle: [botAuth],
				params: t.Object({ discordId: t.String() }),
				detail: { tags: ['Internal'] },
			}
		)
		.get(
			'/clans/:clanId/squads',
			async ({ params }) => {
				const clan = await prisma.clan.findUnique({
					where: { id: params.clanId },
					select: { id: true, name: true, tag: true, region: true },
				})
				if (!clan) return { error: 'Clan not found' }
				return { clan, squads: await squadService.list(params.clanId) }
			},
			{
				beforeHandle: [botAuth],
				params: t.Object({ clanId: t.String() }),
				detail: { tags: ['Internal'] },
			}
		)
		.get(
			'/clans/:clanId/absences',
			async ({ params, query }) => {
				const date = query.date ?? mskDate()
				return {
					clanId: params.clanId,
					date,
					absences: await absenceService.listForDate(
						params.clanId,
						date
					),
				}
			},
			{
				beforeHandle: [botAuth],
				params: t.Object({ clanId: t.String() }),
				query: t.Object({ date: t.Optional(t.String()) }),
				detail: { tags: ['Internal'] },
			}
		)
		.post(
			'/absences',
			async ({ body, set }) => {
				const auth = await prisma.discordAuth.findUnique({
					where: { discord_id: body.discord_id },
					select: { userid: true },
				})
				if (!auth) {
					set.status = 404
					return {
						error: 'Discord account not linked. Link it in profile settings.',
					}
				}
				const profile = await prisma.userClanProfile.findUnique({
					where: { userId: auth.userid },
					select: { clanId: true },
				})
				if (profile?.clanId !== body.clan_id) {
					set.status = 403
					return { error: 'You are not a member of this clan' }
				}
				try {
					const absence = await absenceService.upsert(
						auth.userid,
						body.clan_id,
						body.date,
						body.events,
						body.note
					)
					return { absence }
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [botAuth],
				body: t.Object({
					discord_id: t.String(),
					clan_id: t.String(),
					date: t.String(),
					events: t.Array(
						t.Object({
							eventType: t.String(),
							stages: t.Optional(t.Array(t.Numeric())),
						})
					),
					note: t.Optional(t.String()),
				}),
				detail: { tags: ['Internal'] },
			}
		)
		.delete(
			'/absences',
			async ({ body, set }) => {
				const auth = await prisma.discordAuth.findUnique({
					where: { discord_id: body.discord_id },
					select: { userid: true },
				})
				if (!auth) {
					set.status = 404
					return { error: 'Discord account not linked' }
				}
				try {
					return await absenceService.remove(
						auth.userid,
						body.clan_id,
						body.date
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [botAuth],
				body: t.Object({
					discord_id: t.String(),
					clan_id: t.String(),
					date: t.String(),
				}),
				detail: { tags: ['Internal'] },
			}
		)
		.post(
			'/screenshots',
			async ({ body, set }) => {
				const clan = await prisma.clan.findUnique({
					where: { id: body.clan_id },
					select: { id: true, region: true, name: true },
				})
				if (!clan) {
					set.status = 404
					return { error: 'Clan not found' }
				}

				const file = body.file
				const date = body.date ?? mskDate()
				const detected = detectStageSlot()
				const type = body.type ?? detected?.type ?? null
				const stage = body.stage ?? detected?.stage ?? null
				if (!type || !stage) {
					set.status = 400
					return {
						error: 'type/stage required when no active stage window detected',
						detected,
					}
				}
				let session
				try {
					session = await analyticsService.getOrCreateStageSession({
						clanId: clan.id,
						region: clan.region,
						type,
						stage,
						date,
					})
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}

				const buf = Buffer.from(await file.arrayBuffer())
				try {
					const screenshot = await analyticsService.addScreenshot(
						session.id,
						{
							name: file.name,
							type: file.type,
							buffer: buf,
						}
					)
					return { session, screenshot, detected }
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [botAuth],
				body: t.Object({
					clan_id: t.String(),
					type: t.Optional(t.Enum(StageType)),
					stage: t.Optional(t.Numeric({ minimum: 1 })),
					date: t.Optional(t.String()),
					file: t.File({
						type: ['image/png', 'image/jpeg', 'image/webp'],
					}),
				}),
				detail: { tags: ['Internal'] },
			}
		)
		.get(
			'/stage',
			async ({ query }) => {
				const now = query.at ? new Date(query.at) : new Date()
				return {
					detected: detectStageSlot(now),
					next: nextStageSlot(now),
				}
			},
			{
				beforeHandle: [botAuth],
				query: t.Object({ at: t.Optional(t.String()) }),
				detail: { tags: ['Internal'] },
			}
		)
		.post(
			'/invites/claim',
			async ({ body, set }) => {
				const auth = await prisma.discordAuth.findUnique({
					where: { discord_id: body.discord_id },
					select: { userid: true },
				})
				if (!auth) {
					set.status = 404
					return {
						error: 'Discord account not linked. Link it in profile settings.',
					}
				}
				try {
					return await clanInviteService.claim(
						body.code,
						`discord:${body.discord_id}`
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [botAuth],
				body: t.Object({
					discord_id: t.String(),
					code: t.String({ minLength: 1 }),
				}),
				detail: { tags: ['Internal'] },
			}
		)
		.post(
			'/invites',
			async ({ body, set }) => {
				try {
					return await clanInviteService.createGuestAccount(
						body.clan_id,
						`discord:${body.discord_id}`,
						body.nickname
					)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [botAuth],
				body: t.Object({
					clan_id: t.String(),
					discord_id: t.String(),
					nickname: t.String({ minLength: 1 }),
				}),
				detail: { tags: ['Internal'] },
			}
		)
		.delete(
			'/invites/:id',
			async ({ params, set }) => {
				try {
					return await clanInviteService.revoke(params.id)
				} catch (err) {
					set.status = 400
					return { error: (err as Error).message }
				}
			},
			{
				beforeHandle: [botAuth],
				params: t.Object({ id: t.Numeric() }),
				detail: { tags: ['Internal'] },
			}
		)
		.delete(
			'/invites/guest/discord/:discordId',
			async ({ params, set }) => {
				const auth = await prisma.discordAuth.findUnique({
					where: { discord_id: params.discordId },
					select: { userid: true },
				})
				if (!auth) {
					set.status = 404
					return { error: 'Discord account not linked' }
				}
				const invite = await prisma.clanInvite.findUnique({
					where: { userId: auth.userid },
					select: { userId: true },
				})
				if (!invite) {
					set.status = 400
					return { error: 'This user is not a clan guest' }
				}
				await prisma.$transaction([
					prisma.userClanProfile.deleteMany({
						where: { userId: auth.userid },
					}),
					prisma.clanMember.updateMany({
						where: { userId: auth.userid },
						data: { userId: null },
					}),
					prisma.clanInvite.deleteMany({
						where: { userId: auth.userid },
					}),
					prisma.user.delete({ where: { id: auth.userid } }),
				])
				return { ok: true }
			},
			{
				beforeHandle: [botAuth],
				params: t.Object({ discordId: t.String() }),
				detail: { tags: ['Internal'] },
			}
		)
		.post(
			'/link',
			async ({ body, set }) => {
				const state = await prisma.botLinkState.findUnique({
					where: { token: body.token },
				})
				if (!state || state.expires_at < new Date()) {
					set.status = 400
					return { error: 'Invalid or expired link token' }
				}
				const clan = await prisma.clan.findUnique({
					where: { id: state.clan_id },
					select: { id: true, name: true, tag: true, region: true },
				})
				if (!clan) {
					set.status = 404
					return { error: 'Clan not found' }
				}
				await prisma.$transaction([
					prisma.botLinkState.delete({ where: { id: state.id } }),
					prisma.botGuild.upsert({
						where: { guild_id: body.guild_id },
						update: {
							clan_id: clan.id,
							linked_by: body.discord_id,
						},
						create: {
							guild_id: body.guild_id,
							clan_id: clan.id,
							linked_by: body.discord_id,
						},
					}),
				])
				return {
					guild: {
						guild_id: body.guild_id,
						clan_id: clan.id,
						allowed_role_id: null,
						publish_time: null,
						publish_channel_id: null,
						stages_channel_id: null,
						linked_by: body.discord_id,
						clan,
					},
				}
			},
			{
				beforeHandle: [botAuth],
				body: t.Object({
					guild_id: t.String(),
					token: t.String(),
					discord_id: t.String(),
				}),
				detail: { tags: ['Internal'] },
			}
		)
		.get(
			'/guilds',
			async () => {
				const guilds = await prisma.botGuild.findMany({
					select: guildSelect,
					orderBy: { created_at: 'asc' },
				})
				const clans = await prisma.clan.findMany({
					where: { id: { in: guilds.map((g) => g.clan_id) } },
					select: { id: true, name: true, tag: true, region: true },
				})
				const clanMap = new Map(clans.map((c) => [c.id, c]))
				return {
					guilds: guilds.map((g) => ({
						...g,
						clan: clanMap.get(g.clan_id) ?? null,
					})),
				}
			},
			{
				beforeHandle: [botAuth],
				detail: { tags: ['Internal'] },
			}
		)
		.get(
			'/guilds/:guildId',
			async ({ params, set }) => {
				const guild = await guildWithClan(params.guildId)
				if (!guild) {
					set.status = 404
					return { error: 'Guild not linked' }
				}
				return { guild }
			},
			{
				beforeHandle: [botAuth],
				params: t.Object({ guildId: t.String() }),
				detail: { tags: ['Internal'] },
			}
		)
		.patch(
			'/guilds/:guildId',
			async ({ params, body, set }) => {
				const exists = await prisma.botGuild.findUnique({
					where: { guild_id: params.guildId },
					select: { guild_id: true },
				})
				if (!exists) {
					set.status = 404
					return { error: 'Guild not linked' }
				}
				await prisma.botGuild.update({
					where: { guild_id: params.guildId },
					data: body,
				})
				const guild = await guildWithClan(params.guildId)
				return { guild }
			},
			{
				beforeHandle: [botAuth],
				params: t.Object({ guildId: t.String() }),
				body: t.Object({
					allowed_role_id: t.Optional(
						t.Union([t.String(), t.Null()])
					),
					publish_time: t.Optional(t.Union([t.String(), t.Null()])),
					publish_channel_id: t.Optional(
						t.Union([t.String(), t.Null()])
					),
					stages_channel_id: t.Optional(
						t.Union([t.String(), t.Null()])
					),
				}),
				detail: { tags: ['Internal'] },
			}
		)
		.delete(
			'/guilds/:guildId',
			async ({ params }) => {
				await prisma.botGuild.deleteMany({
					where: { guild_id: params.guildId },
				})
				return { success: true }
			},
			{
				beforeHandle: [botAuth],
				params: t.Object({ guildId: t.String() }),
				detail: { tags: ['Internal'] },
			}
		)
)

export { botRoutes }
