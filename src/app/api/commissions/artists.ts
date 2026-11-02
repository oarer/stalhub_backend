import { prisma } from '@/lib/prisma'
import { permissions, person, transaction } from './data'
import { ensure, money } from './policy'
import type { ProfileInput } from './schemas'

const available = {
	roles: { some: { name: 'author' } },
	NOT: { user_settings: { is: { banned: true } } },
}
const profileInclude = {
	user: { select: person },
	prices: {
		where: { archived: false },
		orderBy: { position: 'asc' as const },
	},
}

async function withPortfolio<
	T extends { user_id: number; portfolio_ids: string[] },
>(profile: T) {
	const portfolio = await prisma.art.findMany({
		where: {
			author_id: profile.user_id,
			external_id: { in: profile.portfolio_ids },
		},
		select: {
			external_id: true,
			title: true,
			type: true,
			image_url: true,
			image_urls: true,
		},
	})
	return { ...profile, portfolio }
}

export const artists = {
	async list(page: number, search: string) {
		const where = {
			accepting: true,
			prices: { some: { archived: false } },
			user: {
				...available,
				OR: [
					{
						username: {
							contains: search,
							mode: 'insensitive' as const,
						},
					},
					{
						name: {
							contains: search,
							mode: 'insensitive' as const,
						},
					},
				],
			},
		}
		const [rows, total] = await Promise.all([
			prisma.artistProfile.findMany({
				where,
				include: profileInclude,
				orderBy: [{ updated_at: 'desc' }, { user_id: 'asc' }],
				skip: (page - 1) * 12,
				take: 12,
			}),
			prisma.artistProfile.count({ where }),
		])
		return { data: await Promise.all(rows.map(withPortfolio)), total, page }
	},
	async get(username: string) {
		const profile = await prisma.artistProfile.findFirst({
			where: { user: { username, ...available } },
			include: profileInclude,
		})
		ensure(profile, 'ARTIST_NOT_FOUND', 404)
		return withPortfolio(profile)
	},
	async mine(userId: number) {
		ensure((await permissions(userId)).author, 'AUTHOR_REQUIRED', 403)
		const profile = await prisma.artistProfile.findUnique({
			where: { user_id: userId },
			include: profileInclude,
		})
		return profile ? withPortfolio(profile) : null
	},
	async save(userId: number, input: ProfileInput) {
		return transaction(async (db) => {
			ensure(
				(await permissions(userId, db)).author,
				'AUTHOR_REQUIRED',
				403
			)
			const old = await db.artistProfile.findUnique({
				where: { user_id: userId },
				include: { prices: true },
			})
			ensure((old?.version ?? 0) === input.version, 'STALE_PROFILE', 409)
			ensure(
				!input.accepting ||
					(input.prices.length > 0 && input.terms.length > 0),
				'PRICE_AND_TERMS_REQUIRED'
			)
			ensure(
				new Set(input.portfolio_ids).size ===
					input.portfolio_ids.length,
				'DUPLICATE_PORTFOLIO'
			)
			const works = await db.art.count({
				where: {
					author_id: userId,
					external_id: { in: input.portfolio_ids },
				},
			})
			ensure(works === input.portfolio_ids.length, 'INVALID_PORTFOLIO')
			const ids = input.prices.flatMap((p) => (p.id ? [p.id] : []))
			ensure(
				new Set(ids).size === ids.length &&
					ids.every((id) => old?.prices.some((p) => p.id === id)),
				'INVALID_PRICE'
			)
			for (const price of input.prices) {
				money(price.amount)
				ensure(price.days_min <= price.days_max, 'INVALID_DURATION')
			}
			const { prices, version, ...data } = input
			await db.artistProfile.upsert({
				where: { user_id: userId },
				create: { user_id: userId, ...data },
				update: { ...data, version: { increment: 1 } },
			})
			await db.commissionPrice.updateMany({
				where: { artist_id: userId },
				data: { archived: true },
			})
			for (const [position, price] of prices.entries()) {
				const { id, ...fields } = price
				if (id)
					await db.commissionPrice.update({
						where: { id },
						data: { ...fields, position, archived: false },
					})
				else
					await db.commissionPrice.create({
						data: { artist_id: userId, ...fields, position },
					})
			}
			return db.artistProfile.findUniqueOrThrow({
				where: { user_id: userId },
				include: profileInclude,
			})
		})
	},
}
