import { prisma } from '@/lib/prisma'
import { serverOnlineService } from '../../server-online/server-online.service'

const DAY_MS = 24 * 60 * 60 * 1000

function dayKey(d: Date): string {
	return new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function buildDailyBuckets(days: number): string[] {
	const now = new Date()
	return Array.from({ length: days }, (_, i) =>
		dayKey(new Date(now.getTime() - (days - 1 - i) * DAY_MS))
	)
}

type DatedRow = { user_joined_at?: Date; created_at?: Date }

function countByDatedRow(
	rows: DatedRow[],
	field: keyof DatedRow,
	buckets: string[]
): { date: string; count: number }[] {
	const map = new Map<string, number>()
	for (const row of rows) {
		const value = row[field]
		if (!value) continue
		const key = dayKey(value)
		map.set(key, (map.get(key) ?? 0) + 1)
	}
	return buckets.map((date) => ({ date, count: map.get(date) ?? 0 }))
}

export const dashboardService = {
	async summary(trendDays: number) {
		const days = Math.min(Math.max(trendDays, 7), 90)
		const since1d = new Date(Date.now() - DAY_MS)
		const since7d = new Date(Date.now() - 7 * DAY_MS)
		const since30d = new Date(Date.now() - 30 * DAY_MS)
		const trendSince = new Date(Date.now() - days * DAY_MS)
		const buckets = buildDailyBuckets(days)

		const [
			usersTotal,
			usersNewToday,
			usersNew7d,
			usersNew30d,
			usersOnboarded,
			usersPublicProfile,
			sessionsActive24h,
			sessionsActive7d,
			sessionsRevoked,
			usersBanned,
			autoBanned,
			autoWarned,

			buildsTotal,
			buildsViews,
			buildsNew7d,
			articlesTotal,
			articlesViews,
			articlesByStatus,
			artsTotal,
			artsViews,
			tierListsTotal,
			tierListsViews,
			commentsTotal,
			commentsNew7d,
			starsTotal,

			clansTotal,
			clansByStatus,
			clansBlocked,
			clansRecruiting,
			clansPublic,
			clanMembersSum,

			bansTotal,
			bans7d,
			warnings7d,
			bansByRule,

			rolesTotal,
			permissionsTotal,
			badgesTotal,

			notificationsTotal,
			notificationsRead,

			popularPlayersTotal,
			blacklistSize,
			playerNotesTotal,

			registrationRows,
			contentRows,
		] = await Promise.all([
			prisma.user.count(),
			prisma.user.count({ where: { joined_at: { gte: since1d } } }),
			prisma.user.count({ where: { joined_at: { gte: since7d } } }),
			prisma.user.count({ where: { joined_at: { gte: since30d } } }),
			prisma.user.count({ where: { onboarded: true } }),
			prisma.userSettings.count({ where: { public_profile: true } }),
			prisma.sessions.count({
				where: { revoked: false, last_used_at: { gte: since1d } },
			}),
			prisma.sessions.count({
				where: { revoked: false, last_used_at: { gte: since7d } },
			}),
			prisma.sessions.count({ where: { revoked: true } }),
			prisma.userSettings.count({ where: { banned: true } }),
			prisma.userSettings.count({ where: { auto_banned: true } }),
			prisma.userSettings.count({
				where: { auto_warned: true, auto_banned: false },
			}),

			prisma.build.count(),
			prisma.build.aggregate({ _sum: { views: true } }),
			prisma.build.count({ where: { created_at: { gte: since7d } } }),
			prisma.article.count(),
			prisma.article.aggregate({ _sum: { views: true } }),
			prisma.article.groupBy({
				by: ['status'],
				_count: { _all: true },
			}),
			prisma.art.count(),
			prisma.art.aggregate({ _sum: { views: true } }),
			prisma.tierList.count(),
			prisma.tierList.aggregate({ _sum: { views: true } }),
			prisma.articleComment.count(),
			prisma.articleComment.count({
				where: { created_at: { gte: since7d } },
			}),
			prisma.star.count(),

			prisma.clan.count(),
			prisma.clan.groupBy({ by: ['status'], _count: { _all: true } }),
			prisma.clan.count({ where: { blocked: true } }),
			prisma.clan.count({ where: { recruiting: true } }),
			prisma.clan.count({ where: { is_public: true } }),
			prisma.clan.aggregate({ _sum: { member_count: true } }),

			prisma.banLog.count(),
			prisma.banLog.count({
				where: { created_at: { gte: since7d } },
			}),
			prisma.banLog.count({
				where: { severity: 'WARN', created_at: { gte: since7d } },
			}),
			prisma.banLog.groupBy({
				by: ['rule', 'severity'],
				_count: { _all: true },
				orderBy: { _count: { rule: 'desc' } },
				take: 20,
			}),

			prisma.role.count(),
			prisma.permission.count(),
			prisma.userBadges.count(),

			prisma.notifications.count(),
			prisma.notifications.count({ where: { read: true } }),

			prisma.popularPlayer.count(),
			prisma.playerBlacklist.count(),
			prisma.playerNote.count(),

			prisma.user.findMany({
				where: { joined_at: { gte: trendSince } },
				select: { joined_at: true },
			}),
			Promise.all([
				prisma.build.findMany({
					where: { created_at: { gte: trendSince } },
					select: { created_at: true },
				}),
				prisma.article.findMany({
					where: { created_at: { gte: trendSince } },
					select: { created_at: true },
				}),
				prisma.art.findMany({
					where: { created_at: { gte: trendSince } },
					select: { created_at: true },
				}),
			]),
		])

		const [buildRows, articleRows, artRows] = contentRows
		const contentTrend = buckets.map((date) => {
			const inBucket = (rows: { created_at: Date }[]) =>
				rows.filter((r) => dayKey(r.created_at) === date).length
			return {
				date,
				builds: inBucket(buildRows),
				articles: inBucket(articleRows),
				arts: inBucket(artRows),
			}
		})

		const [onlineLatest, onlineHistory] = await Promise.all([
			serverOnlineService.latest().catch(
				() =>
					[] as {
						region: string
						server_id: string
						online: number
					}[]
			),
			serverOnlineService.history(24).catch(
				() =>
					[] as {
						region: string
						createdAt: Date
						online: number
					}[]
			),
		])

		const [topBuilds, topArticles, topArts, topPlayers] = await Promise.all(
			[
				prisma.build.findMany({
					orderBy: { views: 'desc' },
					take: 10,
					select: {
						id: true,
						external_id: true,
						title: true,
						views: true,
						created_at: true,
						author: {
							select: { id: true, username: true, name: true },
						},
					},
				}),
				prisma.article.findMany({
					orderBy: { views: 'desc' },
					take: 10,
					select: {
						id: true,
						external_id: true,
						title: true,
						views: true,
						status: true,
						created_at: true,
						author: {
							select: { id: true, username: true, name: true },
						},
					},
				}),
				prisma.art.findMany({
					orderBy: { views: 'desc' },
					take: 10,
					select: {
						id: true,
						external_id: true,
						title: true,
						views: true,
						created_at: true,
					},
				}),
				prisma.popularPlayer.findMany({
					orderBy: { views: 'desc' },
					take: 10,
					select: {
						id: true,
						uuid: true,
						username: true,
						region: true,
						alliance: true,
						views: true,
					},
				}),
			]
		)

		return {
			generated_at: new Date().toISOString(),
			trend_days: days,
			users: {
				total: usersTotal,
				new_today: usersNewToday,
				new_7d: usersNew7d,
				new_30d: usersNew30d,
				onboarded: usersOnboarded,
				public_profiles: usersPublicProfile,
				active_sessions_24h: sessionsActive24h,
				active_sessions_7d: sessionsActive7d,
				revoked_sessions: sessionsRevoked,
				banned: usersBanned,
				auto_banned: autoBanned,
				auto_warned: autoWarned,
				registration_trend: countByDatedRow(
					registrationRows.map((r) => ({
						user_joined_at: r.joined_at,
					})),
					'user_joined_at',
					buckets
				),
			},
			content: {
				builds: {
					total: buildsTotal,
					views: buildsViews._sum.views ?? 0,
					new_7d: buildsNew7d,
				},
				articles: {
					total: articlesTotal,
					views: articlesViews._sum.views ?? 0,
					by_status: Object.fromEntries(
						articlesByStatus.map((r) => [r.status, r._count._all])
					),
				},
				arts: { total: artsTotal, views: artsViews._sum.views ?? 0 },
				tier_lists: {
					total: tierListsTotal,
					views: tierListsViews._sum.views ?? 0,
				},
				comments: { total: commentsTotal, new_7d: commentsNew7d },
				stars: { total: starsTotal },
				creation_trend: contentTrend,
			},
			clans: {
				total: clansTotal,
				recruiting: clansRecruiting,
				public: clansPublic,
				blocked: clansBlocked,
				members_total: clanMembersSum._sum.member_count ?? 0,
				by_status: Object.fromEntries(
					clansByStatus.map((r) => [r.status, r._count._all])
				),
			},
			moderation: {
				ban_logs_total: bansTotal,
				bans_7d: bans7d,
				warnings_7d: warnings7d,
				users_banned: usersBanned,
				auto_banned: autoBanned,
				auto_warned: autoWarned,
				by_rule: bansByRule.map((r) => ({
					rule: r.rule,
					severity: r.severity,
					count: r._count._all,
				})),
			},
			system: {
				roles: rolesTotal,
				permissions: permissionsTotal,
				badges: badgesTotal,
				notifications: notificationsTotal,
				notifications_read: notificationsRead,
			},
			players: {
				popular_players: popularPlayersTotal,
				blacklist_size: blacklistSize,
				player_notes: playerNotesTotal,
			},
			server_online: {
				latest: onlineLatest,
				history_24h: onlineHistory,
			},
			top: {
				builds: topBuilds,
				articles: topArticles,
				arts: topArts,
				players: topPlayers,
			},
		}
	},
}
