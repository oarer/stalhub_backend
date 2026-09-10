import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'

type BanListQuery = {
	auto?: boolean
	rule?: string
	search?: string
	take: number
	page: number
}

export async function listBans({
	auto,
	rule,
	search,
	take,
	page,
}: BanListQuery) {
	const where: Prisma.BanLogWhereInput = {}
	if (auto !== undefined) where.auto = auto
	if (rule) where.rule = rule
	if (search) {
		where.user = {
			OR: [
				{ username: { contains: search, mode: 'insensitive' } },
				{ name: { contains: search, mode: 'insensitive' } },
			],
		}
	}

	const [data, totalCount] = await Promise.all([
		prisma.banLog.findMany({
			where,
			skip: page * take,
			take,
			orderBy: { created_at: 'desc' },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
		}),
		prisma.banLog.count({ where }),
	])

	return { data, total_count: totalCount, page: page + 1, take }
}

export async function abuseStats() {
	const [byRule, warnings, bans, autoBanned, autoWarned] = await Promise.all([
		prisma.banLog.groupBy({
			by: ['rule', 'severity'],
			_count: { _all: true },
			orderBy: { rule: 'asc' },
		}),
		prisma.banLog.count({ where: { severity: 'WARN' } }),
		prisma.banLog.count({ where: { severity: 'BAN' } }),
		prisma.userSettings.count({ where: { auto_banned: true } }),
		prisma.userSettings.count({
			where: { auto_warned: true, auto_banned: false },
		}),
	])

	return {
		total_warnings: warnings,
		total_bans: bans,
		auto_banned_users: autoBanned,
		auto_warned_users: autoWarned,
		by_rule: byRule,
	}
}
