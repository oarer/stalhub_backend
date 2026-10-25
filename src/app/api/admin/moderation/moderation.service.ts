import { ArticleStatus } from 'generated/prisma/enums'
import { logAdminAction } from '@/lib/admin-audit'
import { prisma } from '@/lib/prisma'
import { adminUserService } from '../users/users.service'

async function actorName(user_id: number): Promise<string> {
	const user = await prisma.user.findUnique({
		where: { id: user_id },
		select: { username: true },
	})
	return user?.username ?? ''
}

export const moderationService = {
	async articleQueue({
		take = 24,
		page = 0,
		status,
	}: {
		take?: number
		page?: number
		status?: string
	}) {
		const where =
			status && ArticleStatus[status as keyof typeof ArticleStatus]
				? {
						status: ArticleStatus[
							status as keyof typeof ArticleStatus
						],
					}
				: {
						status: {
							in: [ArticleStatus.PENDING, ArticleStatus.REVIEW],
						},
					}

		const [data, total_count] = await Promise.all([
			prisma.article.findMany({
				where,
				skip: page * take,
				take,
				orderBy: { created_at: 'asc' },
				select: {
					id: true,
					external_id: true,
					title: true,
					type: true,
					status: true,
					views: true,
					created_at: true,
					author: {
						select: { id: true, username: true, name: true },
					},
				},
			}),
			prisma.article.count({ where }),
		])

		return { data, total_count, page: page + 1, take }
	},

	async autoBans({ take = 24, page = 0 }: { take?: number; page?: number }) {
		const clampTake = Math.min(Math.max(take, 1), 100)
		const [data, total_count] = await Promise.all([
			prisma.user.findMany({
				where: { user_settings: { auto_banned: true } },
				skip: page * clampTake,
				take: clampTake,
				orderBy: { joined_at: 'desc' },
				select: {
					id: true,
					username: true,
					name: true,
					joined_at: true,
					user_settings: {
						select: { banned: true, auto_warned: true },
					},
					roles: { select: { name: true, rank: true } },
					discord_auth: {
						select: { discord_id: true, username: true },
					},
					telegram_auth: {
						select: { telegram_id: true, login: true },
					},
				},
			}),
			prisma.user.count({
				where: { user_settings: { auto_banned: true } },
			}),
		])

		return { data, total_count, page: page + 1, take: clampTake }
	},

	async clearAutoBan(actor_id: number, user_id: number) {
		const settings = await prisma.userSettings.findUnique({
			where: { user_id },
		})
		if (!settings) return null

		await prisma.userSettings.update({
			where: { user_id },
			data: { auto_banned: false },
		})

		if (settings.banned && settings.ban_reason === null) {
			await adminUserService.unban(user_id)
		}

		await logAdminAction({
			actor_id,
			actor_name: await actorName(actor_id),
			action: 'clear_auto_ban',
			entity: 'user',
			entity_id: user_id,
			meta: { was_banned: settings.banned },
		})

		return { success: true }
	},

	async multiaccounts({ days = 30 }: { days?: number }) {
		const windowDays = Math.min(Math.max(days, 1), 180)
		const rows = await prisma.sessions.findMany({
			where: {
				revoked: false,
				last_used_at: {
					gte: new Date(Date.now() - windowDays * 86_400_000),
				},
			},
			select: {
				ip: true,
				user_agent: true,
				last_used_at: true,
				user: {
					select: {
						id: true,
						username: true,
						name: true,
						user_settings: { select: { banned: true } },
					},
				},
			},
		})

		const groups = new Map<
			string,
			{
				accounts: Map<
					number,
					{
						id: number
						username: string
						name: string
						banned: boolean
						last_used_at: string
					}
				>
			}
		>()

		for (const row of rows) {
			if (!row.ip || row.ip === '') continue
			const group = groups.get(row.ip) ?? { accounts: new Map() }
			const existing = group.accounts.get(row.user.id)
			if (
				!existing ||
				row.last_used_at.getTime() >
					new Date(existing.last_used_at).getTime()
			) {
				group.accounts.set(row.user.id, {
					id: row.user.id,
					username: row.user.username,
					name: row.user.name,
					banned: row.user.user_settings?.banned ?? false,
					last_used_at: row.last_used_at.toISOString(),
				})
			}
			groups.set(row.ip, group)
		}

		const data = Array.from(groups.entries())
			.filter(([, g]) => g.accounts.size > 1)
			.map(([ip, g]) => ({
				ip,
				accounts: Array.from(g.accounts.values()).sort(
					(a, b) =>
						new Date(b.last_used_at).getTime() -
						new Date(a.last_used_at).getTime()
				),
				banned_count: Array.from(g.accounts.values()).filter(
					(a) => a.banned
				).length,
			}))
			.sort(
				(a, b) =>
					b.accounts.length - a.accounts.length ||
					b.banned_count - a.banned_count
			)
			.slice(0, 50)

		return { data, total_count: data.length }
	},

	async comments({ take = 24, page = 0 }: { take?: number; page?: number }) {
		const clampTake = Math.min(Math.max(take, 1), 100)
		const [data, total_count] = await Promise.all([
			prisma.articleComment.findMany({
				skip: page * clampTake,
				take: clampTake,
				orderBy: { created_at: 'desc' },
				select: {
					id: true,
					content: true,
					created_at: true,
					article: {
						select: { id: true, external_id: true, title: true },
					},
					art: { select: { id: true, title: true } },
					profile_user: { select: { id: true, username: true } },
					replies: { select: { id: true } },
					parent: { select: { id: true } },
					author: {
						select: { id: true, username: true, name: true },
					},
				},
			}),
			prisma.articleComment.count(),
		])

		return { data, total_count, page: page + 1, take: clampTake }
	},

	async deleteComment(actor_id: number, comment_id: number) {
		const comment = await prisma.articleComment.findUnique({
			where: { id: comment_id },
		})
		if (!comment) return null

		await prisma.articleComment.delete({ where: { id: comment_id } })

		await logAdminAction({
			actor_id,
			actor_name: await actorName(actor_id),
			action: 'delete_comment',
			entity: 'comment',
			entity_id: comment_id,
			meta: { author_id: comment.author_id },
		})

		return { success: true }
	},
}
