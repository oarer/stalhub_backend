import type { Prisma } from 'generated/prisma/client'
import { logAdminAction } from '@/lib/admin-audit'
import { prisma } from '@/lib/prisma'
import { deleteUpload, putUpload } from '@/lib/uploads'
import { checkRole } from '@/utils/auth.guard'
import { compressImageBuffer } from '@/utils/image-compress'
import { transliterate } from '@/utils/slug'
import { validateImageUpload } from '@/utils/upload-validation'
import { normalizeSocialLinks } from '../../awards/social-links'
import { adminNotificationService } from '../notifications/notifications.service'
import { computePlaces, qualifiesTie } from './results'

const STATUS: Record<string, string> = {
	DRAFT: 'draft',
	VOTING: 'voting',
	ENDED: 'ended',
	PUBLISHED: 'published',
}

const KIND: Record<string, string> = {
	NOMINEES: 'nominees',
	UPDATES: 'updates',
	CLAN: 'clan',
	PLAYER: 'player',
}

const REQUIRED_LOCALES = ['ru'] as const

const RESERVED_SLUGS = new Set([
	'vote',
	'results',
	'nominees',
	'nominate',
	'votes',
	'stats',
	'avatar',
])

const NOMINEE_SELECT = {
	id: true,
	category_id: true,
	name: true,
	avatar_url: true,
	date: true,
	patch_url: true,
	social_links: true,
	description_i18n: true,
	clan_id: true,
	clan_name: true,
	clan_tag: true,
	clan_member_count: true,
	nominated_by: true,
	position: true,
	manual_place: true,
	created_at: true,
	updated_at: true,
} satisfies Prisma.AwardNomineeSelect

export async function ownerOnly(id: string, actor: number) {
	const c = await prisma.awardCampaign.findUnique({
		where: { id },
		select: { status: true },
	})
	if (c?.status === 'PUBLISHED' && !(await checkRole(actor, 'owner')))
		throw { status: 403, code: 'owner_required' }
}

function missing(value: unknown, required: boolean) {
	if (!value || typeof value !== 'object')
		return required ? [...REQUIRED_LOCALES] : []
	const r = value as Record<string, unknown>
	return REQUIRED_LOCALES.filter((k) => typeof r[k] !== 'string' || !r[k])
}

function slug(input: unknown, used: string[]) {
	const text =
		typeof input === 'object' && input !== null
			? (input as Record<string, unknown>).ru
			: 'category'
	const base =
		transliterate(String(text))
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'category'
	if (RESERVED_SLUGS.has(base)) throw { status: 422, code: 'reserved_slug' }
	let s = base,
		n = 2
	while (used.includes(s)) s = `${base}-${n++}`
	return s
}

export async function list() {
	const now = new Date()
	await prisma.awardCampaign.updateMany({
		where: { status: 'VOTING', ends_at: { lte: now } },
		data: { status: 'ENDED', voting_closed_at: now },
	})
	const rows = await prisma.awardCampaign.findMany({
		orderBy: { year: 'desc' },
		select: {
			id: true,
			year: true,
			is_test: true,
			title: true,
			status: true,
			ends_at: true,
			created_at: true,
			updated_at: true,
			categories: {
				select: { _count: { select: { nominees: true, votes: true } } },
			},
		},
	})
	return {
		items: rows.map((x) => ({
			id: x.id,
			year: x.year,
			is_test: x.is_test,
			title: x.title,
			status: STATUS[x.status],
			ends_at: x.ends_at,
			created_at: x.created_at,
			updated_at: x.updated_at,
			categories_count: x.categories.length,
			nominees_count: x.categories.reduce(
				(n, c) => n + c._count.nominees,
				0
			),
			votes_count: x.categories.reduce((n, c) => n + c._count.votes, 0),
		})),
	}
}

export async function categories(id: string) {
	const r = await prisma.awardCampaign.findUnique({
		where: { id },
		select: {
			categories: {
				orderBy: { position: 'asc' },
				select: {
					id: true,
					campaign_id: true,
					slug: true,
					position: true,
					kind: true,
					title_i18n: true,
					description_i18n: true,
					image_url: true,
					_count: { select: { nominees: true } },
				},
			},
		},
	})
	if (!r) throw { status: 404, code: 'not_found' }
	return {
		items: r.categories.map((x) => ({
			...x,
			kind: KIND[x.kind],
			nominees_count: x._count.nominees,
		})),
	}
}

export async function nominees(campaignId: string, categoryId: string) {
	const r = await prisma.awardCategory.findFirst({
		where: { id: categoryId, campaign_id: campaignId },
		select: {
			nominees: { orderBy: { position: 'asc' }, select: NOMINEE_SELECT },
		},
	})
	if (!r) throw { status: 404, code: 'not_found' }
	return {
		items: r.nominees.map((n) => ({
			...n,
			social_links: normalizeSocialLinks(n.social_links),
		})),
	}
}

export async function createCampaign(input: {
	year: number
	title?: string
	ends_at?: string
	is_test?: boolean
}) {
	if (input.ends_at) {
		const d = new Date(input.ends_at)
		if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now())
			throw { status: 422, code: 'invalid_ends_at' }
	}
	const is_test = input.is_test ?? false
	if (!is_test) {
		const existing = await prisma.awardCampaign.findFirst({
			where: { year: input.year, is_test: false },
			select: { id: true },
		})
		if (existing) throw { status: 409, code: 'already_exists' }
	}
	try {
		return await prisma.awardCampaign.create({
			data: {
				year: input.year,
				is_test,
				title: input.title ?? 'StalZone Awards',
				ends_at: input.ends_at ? new Date(input.ends_at) : null,
			},
			select: {
				id: true,
				year: true,
				is_test: true,
				title: true,
				status: true,
				ends_at: true,
			},
		})
	} catch (e) {
		if ((e as { code?: string }).code === 'P2002')
			throw { status: 409, code: 'already_exists' }
		throw e
	}
}

export async function patchCampaign(
	id: string,
	input: {
		title?: string
		ends_at?: string | null
		status?: string
		is_test?: boolean
	},
	actor: number
) {
	const c = await prisma.awardCampaign.findUnique({
		where: { id },
		select: {
			id: true,
			status: true,
			ends_at: true,
			year: true,
			is_test: true,
		},
	})
	if (!c) throw { status: 404, code: 'not_found' }
	await ownerOnly(id, actor)
	if (input.ends_at && new Date(input.ends_at) <= new Date())
		throw { status: 422, code: 'invalid_ends_at' }
	if (input.ends_at && Number.isNaN(new Date(input.ends_at).getTime()))
		throw { status: 422, code: 'invalid_ends_at' }
	if (
		input.ends_at !== undefined &&
		['ENDED', 'PUBLISHED'].includes(c.status)
	)
		throw { status: 422, code: 'ends_at_immutable' }
	if (input.is_test === false) {
		const existing = await prisma.awardCampaign.findFirst({
			where: { year: c.year, is_test: false, id: { not: id } },
			select: { id: true },
		})
		if (existing) throw { status: 409, code: 'already_exists' }
	}
	const next = input.status?.toUpperCase()
	if (
		next &&
		next !== c.status &&
		!(
			(c.status === 'DRAFT' && next === 'VOTING') ||
			(c.status === 'VOTING' && next === 'ENDED') ||
			(c.status === 'ENDED' &&
				(next === 'VOTING' || next === 'PUBLISHED'))
		)
	)
		throw { status: 409, code: 'illegal_transition' }
	if (next === 'PUBLISHED' && next !== c.status) return publish(id, actor)
	const updated = await prisma.awardCampaign.update({
		where: { id },
		data: {
			title: input.title,
			is_test: input.is_test,
			ends_at:
				input.ends_at === undefined
					? undefined
					: input.ends_at
						? new Date(input.ends_at)
						: null,
			status: next as never,
			voting_closed_at:
				next === 'ENDED'
					? new Date()
					: next === 'VOTING' && c.status === 'ENDED'
						? null
						: undefined,
		},
		select: {
			id: true,
			year: true,
			is_test: true,
			status: true,
			title: true,
			ends_at: true,
		},
	})
	if (!c.is_test && c.status === 'DRAFT' && next === 'VOTING')
		await adminNotificationService.sendToAll({
			title: 'Голосование началось',
			content: 'Голосование за StalZone Awards открыто',
			link: '/awards',
		})
	if (!c.is_test && c.status === 'VOTING' && next === 'ENDED')
		await adminNotificationService.sendToAll({
			title: 'Голосование завершено',
			content: 'Приём голосов завершён, ожидайте итоги',
			link: '/awards',
		})
	if (!c.is_test && c.status === 'ENDED' && next === 'VOTING')
		await adminNotificationService.sendToAll({
			title: 'Голосование началось',
			content: 'Голосование за StalZone Awards открыто',
			link: '/awards',
		})
	return updated
}

export async function createCategory(
	campaignId: string,
	input: {
		slug?: string
		title_i18n: unknown
		description_i18n?: unknown
		kind?: 'NOMINEES' | 'UPDATES' | 'CLAN' | 'PLAYER'
		position?: number
		image_url?: string | null
	},
	actor: number
) {
	await ownerOnly(campaignId, actor)
	const m = missing(input.title_i18n, true)
	if (m.length) throw { status: 422, code: 'missing_locales', locales: m }
	if (!input.image_url) throw { status: 422, code: 'image_required' }
	if (!isSafeCategoryUpload(input.image_url))
		throw { status: 422, code: 'invalid_image_url' }
	const used = (
		await prisma.awardCategory.findMany({
			where: { campaign_id: campaignId },
			select: { slug: true },
		})
	).map((x) => x.slug)
	try {
		return await prisma.awardCategory.create({
			data: {
				campaign_id: campaignId,
				slug: input.slug
					? normalizeExplicitSlug(input.slug, used)
					: slug(input.title_i18n, used),
				title_i18n: input.title_i18n as Prisma.InputJsonValue,
				description_i18n:
					input.description_i18n as Prisma.InputJsonValue,
				kind: input.kind ?? 'NOMINEES',
				position: input.position ?? 0,
				image_url: input.image_url,
			},
			select: {
				id: true,
				campaign_id: true,
				slug: true,
				kind: true,
				title_i18n: true,
				description_i18n: true,
				position: true,
				image_url: true,
			},
		})
	} catch (e) {
		if ((e as { code?: string }).code === 'P2002')
			throw { status: 409, code: 'slug_exists' }
		throw e
	}
}

export async function deleteCategory(
	campaignId: string,
	categoryId: string,
	actor: number
) {
	await ownerOnly(campaignId, actor)
	const x = await prisma.awardCategory.findFirst({
		where: { id: categoryId, campaign_id: campaignId },
		select: {
			id: true,
			image_url: true,
			nominees: { select: { avatar_url: true } },
		},
	})
	if (!x) throw { status: 404, code: 'not_found' }
	await prisma.awardCategory.delete({ where: { id: categoryId } })
	if (isSafeCategoryUpload(x.image_url))
		await deleteUpload(x.image_url).catch(() => undefined)
	for (const n of x.nominees) {
		if (isSafeAwardsUpload(n.avatar_url))
			await deleteUpload(n.avatar_url).catch(() => undefined)
	}
	return { ok: true }
}

export async function createNominee(
	campaignId: string,
	categoryId: string,
	input: {
		name?: string
		description_i18n?: unknown
		date?: string | null
		patch_url?: string | null
		avatar_url?: string | null
		social_links?: { label: string; url: string }[]
	},
	actor: number
) {
	await ownerOnly(campaignId, actor)
	const c = await prisma.awardCategory.findFirst({
		where: { id: categoryId, campaign_id: campaignId },
		select: { kind: true, _count: { select: { nominees: true } } },
	})
	if (!c) throw { status: 404, code: 'not_found' }
	if (c.kind === 'CLAN' || c.kind === 'PLAYER')
		throw { status: 422, code: 'clan_nominees_readonly' }
	const m = missing(input.description_i18n, c.kind === 'NOMINEES')
	if (m.length) throw { status: 422, code: 'missing_locales', locales: m }
	if (
		input.avatar_url !== undefined &&
		input.avatar_url !== null &&
		!isSafeAwardsUpload(input.avatar_url)
	)
		throw { status: 422, code: 'invalid_avatar_url' }
	if (
		input.social_links &&
		(input.social_links.length > 10 ||
			input.social_links.some((l) => !/^https?:\/\//.test(l.url)))
	)
		throw { status: 422, code: 'invalid_social_links' }
	if (c.kind === 'UPDATES') {
		if (input.date && Number.isNaN(new Date(input.date).getTime()))
			throw { status: 422, code: 'invalid_date' }
		if (input.patch_url && !/^https?:\/\//.test(input.patch_url))
			throw { status: 422, code: 'invalid_patch_url' }
	}
	return prisma.awardNominee.create({
		data: {
			category_id: categoryId,
			name: input.name ?? '',
			description_i18n: input.description_i18n as Prisma.InputJsonValue,
			date:
				c.kind === 'UPDATES' && input.date
					? new Date(input.date)
					: null,
			patch_url: c.kind === 'UPDATES' ? input.patch_url : null,
			avatar_url: input.avatar_url ?? null,
			social_links: (input.social_links ??
				[]) as unknown as Prisma.InputJsonValue,
			position: c._count.nominees,
		},
		select: NOMINEE_SELECT,
	})
}

export async function deleteNominee(
	campaignId: string,
	categoryId: string,
	nomineeId: string,
	actor: number
) {
	await ownerOnly(campaignId, actor)
	const x = await prisma.awardNominee.findFirst({
		where: {
			id: nomineeId,
			category_id: categoryId,
			category: { campaign_id: campaignId },
		},
		select: { avatar_url: true },
	})
	if (!x) throw { status: 404, code: 'not_found' }
	await prisma.awardNominee.delete({ where: { id: nomineeId } })
	if (isSafeAwardsUpload(x.avatar_url)) await deleteUpload(x.avatar_url)
	return { ok: true }
}
export async function results(
	id: string,
	client: Prisma.TransactionClient | typeof prisma = prisma
) {
	const c = await client.awardCampaign.findUnique({
		where: { id },
		select: {
			id: true,
			status: true,
			is_test: true,
			results_published_at: true,
			categories: {
				select: {
					id: true,
					slug: true,
					kind: true,
					title_i18n: true,
					description_i18n: true,
					image_url: true,
					nominees: {
						select: {
							id: true,
							name: true,
							avatar_url: true,
							date: true,
							patch_url: true,
							social_links: true,
							description_i18n: true,
							clan_id: true,
							clan_name: true,
							clan_tag: true,
							clan_member_count: true,
							clan: { select: { alliance: true } },
							manual_place: true,
							votes: {
								where: { excluded_at: null },
								select: { id: true },
							},
						},
					},
				},
			},
		},
	})
	if (!c) throw { status: 404, code: 'not_found' }
	const categories = c.categories.map((cat) => {
		const rows = cat.nominees.map((n) => ({
			id: n.id,
			votes_count: n.votes.length,
			manual_place: n.manual_place,
			place: null as number | null,
		}))
		const ranked = computePlaces(rows)
		// Player nominees are added by voters at any time, so ties behind
		// the winner are expected there; publishing must not depend on them.
		const tie = cat.kind === 'PLAYER' ? null : qualifiesTie(rows)
		return {
			id: cat.id,
			slug: cat.slug,
			kind: KIND[cat.kind],
			title_i18n: cat.title_i18n,
			description_i18n: cat.description_i18n,
			image_url: cat.image_url,
			nominees: ranked.map((row) => {
				const n = cat.nominees.find((x) => x.id === row.id)
				return {
					id: row.id,
					votes_count: row.votes_count,
					place: row.place,
					manual_place: row.manual_place,
					name: n?.name ?? '',
					avatar_url: n?.avatar_url ?? null,
					date: n?.date ?? null,
					patch_url: n?.patch_url ?? null,
					social_links: normalizeSocialLinks(n?.social_links),
					description_i18n: n?.description_i18n ?? null,
					clan_id: n?.clan_id ?? null,
					clan_name: n?.clan_name ?? null,
					clan_tag: n?.clan_tag ?? null,
					clan_member_count: n?.clan_member_count ?? null,
					clan_faction: n?.clan?.alliance ?? null,
				}
			}),
			winner_ids: ranked.filter((n) => n.place === 1).map((n) => n.id),
			ties: Boolean(tie),
			tie_ids: tie?.map((n) => n.id) ?? [],
		}
	})
	const blocked = categories.find((x) => x.ties)
	return {
		campaign_id: c.id,
		is_test: c.is_test,
		categories,
		can_publish: c.status === 'ENDED' && !blocked,
		publish_block_reason: blocked ? 'tie' : null,
		published_at: c.results_published_at?.toISOString() ?? null,
	}
}

async function publish(id: string, actor: number) {
	const pre = await results(id)
	if (!pre.can_publish)
		throw {
			status: 409,
			publish_block_reason: pre.publish_block_reason,
			categories: pre.categories
				.filter((x) => x.ties)
				.map((x) => ({ id: x.id, tied_nominee_ids: x.tie_ids })),
		}
	const result = await prisma.$transaction(async (tx) => {
		const now = new Date()
		const fresh = await results(id, tx)
		if (fresh.publish_block_reason) {
			throw {
				status: 409,
				publish_block_reason: 'tie',
				categories: fresh.categories
					.filter((x) => x.ties)
					.map((x) => ({ id: x.id, tied_nominee_ids: x.tie_ids })),
			}
		}
		const updated = await tx.awardCampaign.updateMany({
			where: { id, status: 'ENDED' },
			data: {
				status: 'PUBLISHED',
				results_published_at: now,
				results_snapshot: {
					version: 1,
					published_at: now.toISOString(),
					computed_at: now.toISOString(),
					categories: fresh.categories,
				} as unknown as Prisma.InputJsonValue,
			},
		})
		if (updated.count !== 1)
			throw { status: 409, code: 'illegal_transition' }
		return { ok: true }
	})
	if (!pre.is_test)
		await adminNotificationService.sendToAll({
			title: 'Итоги опубликованы',
			content: 'Итоги StalZone Awards опубликованы',
			link: '/awards',
		})
	return result
}

export async function patchCategory(
	campaignId: string,
	categoryId: string,
	input: {
		slug?: string
		title_i18n?: unknown
		description_i18n?: unknown
		kind?: 'NOMINEES' | 'UPDATES' | 'CLAN' | 'PLAYER'
		position?: number
		image_url?: string | null
	},
	actor: number
) {
	await ownerOnly(campaignId, actor)
	const category = await prisma.awardCategory.findFirst({
		where: { id: categoryId, campaign_id: campaignId },
		select: { id: true, image_url: true },
	})
	if (!category) throw { status: 404, code: 'not_found' }
	if (
		input.image_url === null ||
		(input.image_url === undefined && !category.image_url)
	)
		throw { status: 422, code: 'image_required' }
	if (input.image_url !== undefined && !isSafeCategoryUpload(input.image_url))
		throw { status: 422, code: 'invalid_image_url' }
	if (input.title_i18n !== undefined) {
		const m = missing(input.title_i18n, true)
		if (m.length) throw { status: 422, code: 'missing_locales', locales: m }
	}
	const used =
		input.slug !== undefined
			? (
					await prisma.awardCategory.findMany({
						where: {
							campaign_id: campaignId,
							id: { not: categoryId },
						},
						select: { slug: true },
					})
				).map((x) => x.slug)
			: []
	try {
		const updated = await prisma.awardCategory.update({
			where: { id: categoryId },
			data: {
				slug:
					input.slug !== undefined
						? normalizeExplicitSlug(input.slug, used)
						: undefined,
				title_i18n: input.title_i18n as Prisma.InputJsonValue,
				description_i18n:
					input.description_i18n as Prisma.InputJsonValue,
				kind: input.kind,
				position: input.position,
				image_url: input.image_url,
			},
			select: {
				id: true,
				campaign_id: true,
				slug: true,
				kind: true,
				title_i18n: true,
				description_i18n: true,
				position: true,
				image_url: true,
			},
		})
		if (
			input.image_url !== undefined &&
			category.image_url &&
			category.image_url !== input.image_url &&
			isSafeCategoryUpload(category.image_url)
		)
			await deleteUpload(category.image_url)
		return updated
	} catch (e) {
		if ((e as { code?: string }).code === 'P2002')
			throw { status: 409, code: 'slug_exists' }
		throw e
	}
}

export async function patchNominee(
	campaignId: string,
	categoryId: string,
	nomineeId: string,
	input: {
		name?: string
		description_i18n?: unknown
		date?: string | null
		patch_url?: string | null
		avatar_url?: string | null
		social_links?: { label: string; url: string }[]
	},
	actor: number
) {
	await ownerOnly(campaignId, actor)
	const category = await prisma.awardCategory.findFirst({
		where: { id: categoryId, campaign_id: campaignId },
		select: { kind: true },
	})
	if (!category) throw { status: 404, code: 'not_found' }
	if (category.kind === 'CLAN' || category.kind === 'PLAYER')
		throw { status: 422, code: 'clan_nominees_readonly' }
	const existing = await prisma.awardNominee.findFirst({
		where: {
			id: nomineeId,
			category_id: categoryId,
			category: { campaign_id: campaignId },
		},
		select: { id: true, avatar_url: true },
	})
	if (!existing) throw { status: 404, code: 'not_found' }
	if (category.kind === 'NOMINEES' && input.description_i18n !== undefined) {
		const m = missing(input.description_i18n, true)
		if (m.length) throw { status: 422, code: 'missing_locales', locales: m }
	}
	if (
		category.kind === 'UPDATES' &&
		input.patch_url &&
		!/^https?:\/\//.test(input.patch_url)
	)
		throw { status: 422, code: 'invalid_patch_url' }
	if (
		category.kind === 'UPDATES' &&
		input.date &&
		Number.isNaN(new Date(input.date).getTime())
	)
		throw { status: 422, code: 'invalid_date' }
	if (
		input.avatar_url !== undefined &&
		input.avatar_url !== null &&
		!isSafeAwardsUpload(input.avatar_url)
	)
		throw { status: 422, code: 'invalid_avatar_url' }
	if (
		input.social_links &&
		(input.social_links.length > 10 ||
			input.social_links.some((l) => !/^https?:\/\//.test(l.url)))
	)
		throw { status: 422, code: 'invalid_social_links' }
	const updated = await prisma.awardNominee.update({
		where: { id: nomineeId },
		data: {
			name: input.name,
			description_i18n: input.description_i18n as Prisma.InputJsonValue,
			date:
				category.kind === 'UPDATES'
					? input.date === null
						? null
						: input.date
							? new Date(input.date)
							: undefined
					: undefined,
			patch_url:
				category.kind === 'UPDATES' ? input.patch_url : undefined,
			avatar_url:
				input.avatar_url !== undefined ? input.avatar_url : undefined,
			social_links:
				input.social_links !== undefined
					? (input.social_links as unknown as Prisma.InputJsonValue)
					: undefined,
		},
		select: NOMINEE_SELECT,
	})
	if (
		input.avatar_url !== undefined &&
		existing.avatar_url &&
		existing.avatar_url !== input.avatar_url &&
		isSafeAwardsUpload(existing.avatar_url)
	)
		await deleteUpload(existing.avatar_url)
	return updated
}

export async function setPlace(
	campaignId: string,
	categoryId: string,
	nomineeId: string,
	manualPlace: number | null,
	actor: number
) {
	await ownerOnly(campaignId, actor)
	const category = await prisma.awardCategory.findFirst({
		where: { id: categoryId, campaign_id: campaignId },
		select: { _count: { select: { nominees: true } } },
	})
	if (!category) throw { status: 404, code: 'not_found' }
	if (
		manualPlace !== null &&
		(!Number.isInteger(manualPlace) ||
			manualPlace < 1 ||
			manualPlace > category._count.nominees)
	)
		throw { status: 422, code: 'invalid_place' }
	const nominee = await prisma.awardNominee.findFirst({
		where: { id: nomineeId, category_id: categoryId },
		select: { id: true },
	})
	if (!nominee) throw { status: 404, code: 'not_found' }
	return prisma.awardNominee.update({
		where: { id: nomineeId },
		data: { manual_place: manualPlace },
		select: { id: true, manual_place: true },
	})
}

export async function setPlaces(
	campaignId: string,
	items: {
		category_id: string
		nominee_id: string
		manual_place: number | null
	}[],
	actor: number
) {
	await ownerOnly(campaignId, actor)
	if (!items.length) return { ok: true }
	await prisma.$transaction(async (tx) => {
		const categories = await tx.awardCategory.findMany({
			where: { campaign_id: campaignId },
			select: { id: true, _count: { select: { nominees: true } } },
		})
		const limits = new Map(
			categories.map((c) => [c.id, c._count.nominees])
		)
		const nominees = await tx.awardNominee.findMany({
			where: {
				id: { in: items.map((i) => i.nominee_id) },
				category: { campaign_id: campaignId },
			},
			select: { id: true, category_id: true },
		})
		const owners = new Map(nominees.map((n) => [n.id, n.category_id]))
		for (const item of items) {
			const max = limits.get(item.category_id)
			if (max === undefined) throw { status: 404, code: 'not_found' }
			if (owners.get(item.nominee_id) !== item.category_id)
				throw { status: 404, code: 'not_found' }
			if (
				item.manual_place !== null &&
				(!Number.isInteger(item.manual_place) ||
					item.manual_place < 1 ||
					item.manual_place > max)
			)
				throw { status: 422, code: 'invalid_place' }
		}
		for (const item of items) {
			await tx.awardNominee.update({
				where: { id: item.nominee_id },
				data: { manual_place: item.manual_place },
			})
		}
	})
	return { ok: true }
}

export async function votes(
	campaignId: string,
	query: {
		category_id?: string
		nominee_id?: string
		user_id?: number
		excluded?: boolean
		from?: string
		to?: string
		cursor?: string
		take?: number
	}
) {
	const campaign = await prisma.awardCampaign.findUnique({
		where: { id: campaignId },
		select: { id: true },
	})
	if (!campaign) throw { status: 404, code: 'not_found' }
	const take = Math.min(Math.max(query.take ?? 25, 1), 100)
	const rows = await prisma.awardVote.findMany({
		where: {
			category: { campaign_id: campaignId },
			category_id: query.category_id,
			nominee_id: query.nominee_id,
			user_id: query.user_id,
			excluded_at:
				query.excluded === undefined
					? undefined
					: query.excluded
						? { not: null }
						: null,
			created_at: {
				gte: query.from ? new Date(query.from) : undefined,
				lte: query.to ? new Date(query.to) : undefined,
			},
		},
		orderBy: { id: 'desc' },
		take: take + 1,
		...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
		select: {
			id: true,
			category_id: true,
			nominee_id: true,
			created_at: true,
			excluded_at: true,
			excluded_by: true,
			exclude_reason: true,
			user: { select: { id: true, username: true } },
		},
	})
	const hasMore = rows.length > take
	const items = rows.slice(0, take)
	return {
		items,
		next_cursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
		has_more: hasMore,
	}
}

export async function excludeVote(
	campaignId: string,
	voteId: string,
	excluded: boolean,
	reason: string | undefined,
	actor: number
) {
	const campaign = await prisma.awardCampaign.findUnique({
		where: { id: campaignId },
		select: { status: true },
	})
	if (!campaign) throw { status: 404, code: 'not_found' }
	await ownerOnly(campaignId, actor)
	const vote = await prisma.awardVote.findFirst({
		where: { id: voteId, category: { campaign_id: campaignId } },
		select: { id: true },
	})
	if (!vote) throw { status: 404, code: 'not_found' }
	const row = await prisma.awardVote.update({
		where: { id: voteId },
		data: {
			excluded_at: excluded ? new Date() : null,
			excluded_by: excluded ? actor : null,
			exclude_reason: excluded ? (reason ?? null) : null,
		},
		select: {
			id: true,
			excluded_at: true,
			excluded_by: true,
			exclude_reason: true,
		},
	})
	await logAdminAction({
		actor_id: actor,
		action: excluded ? 'award.vote.exclude' : 'award.vote.restore',
		entity: 'AwardVote',
		entity_id: voteId,
		meta: { campaign_id: campaignId, reason: reason ?? null },
	})
	return row
}

function normalizeExplicitSlug(value: string, used: string[]): string {
	const base = transliterate(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	if (!base) throw { status: 422, code: 'invalid_slug' }
	if (RESERVED_SLUGS.has(base)) throw { status: 422, code: 'reserved_slug' }
	if (used.includes(base)) throw { status: 409, code: 'slug_exists' }
	return base
}

export async function stats(campaignId: string) {
	const campaign = await prisma.awardCampaign.findUnique({
		where: { id: campaignId },
		select: {
			id: true,
			categories: {
				select: {
					id: true,
					_count: { select: { votes: true } },
					votes: {
						where: { excluded_at: null },
						select: { id: true },
					},
				},
			},
		},
	})
	if (!campaign) throw { status: 404, code: 'not_found' }
	const categories = campaign.categories.map((c) => {
		const active = c.votes.length
		const all = c._count.votes
		return {
			id: c.id,
			votes_count: active,
			excluded_count: all - active,
		}
	})
	return {
		total: categories.reduce((n, c) => n + c.votes_count, 0),
		excluded: categories.reduce((n, c) => n + c.excluded_count, 0),
		categories,
	}
}

function isSafeUpload(value: string | undefined | null, prefix: string) {
	if (!value) return false
	if (!value.startsWith(prefix)) return false
	let decoded: string
	try {
		decoded = decodeURIComponent(value)
	} catch {
		return false
	}
	if (
		decoded.includes('..') ||
		decoded.includes('\\') ||
		/[\0\r\n]/.test(decoded)
	)
		return false
	return true
}
function isSafeAwardsUpload(value: string | undefined | null): value is string {
	return isSafeUpload(value, '/uploads/awards/nominees/')
}
function isSafeCategoryUpload(
	value: string | undefined | null
): value is string {
	return isSafeUpload(value, '/uploads/awards/categories/')
}

export async function avatar(buffer: Buffer, previousUrl: string | undefined) {
	if (previousUrl !== undefined && !isSafeAwardsUpload(previousUrl))
		throw { status: 422, code: 'invalid_previous_url' }
	let mime: string
	let ext: string
	try {
		const validated = validateImageUpload(buffer)
		mime = validated.mime
		ext = validated.ext
	} catch {
		throw { status: 422, code: 'invalid_image' }
	}
	const data = await compressImageBuffer(buffer, mime)
	const path = `/uploads/awards/nominees/${crypto.randomUUID()}${ext}`
	try {
		await putUpload(path, data, mime)
	} catch {
		throw { status: 500, code: 'avatar_storage_error' }
	}
	if (previousUrl) await deleteUpload(previousUrl)
	return { url: path }
}

export async function categoryImage(
	buffer: Buffer,
	previousUrl: string | undefined
) {
	if (previousUrl !== undefined && !isSafeCategoryUpload(previousUrl))
		throw { status: 422, code: 'invalid_previous_url' }
	let mime: string
	let ext: string
	try {
		const validated = validateImageUpload(buffer)
		mime = validated.mime
		ext = validated.ext
	} catch {
		throw { status: 422, code: 'invalid_image' }
	}
	const data = await compressImageBuffer(buffer, mime)
	const path = `/uploads/awards/categories/${crypto.randomUUID()}${ext}`
	try {
		await putUpload(path, data, mime)
	} catch {
		throw { status: 500, code: 'image_storage_error' }
	}
	if (previousUrl) await deleteUpload(previousUrl)
	return { url: path }
}
