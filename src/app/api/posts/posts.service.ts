import { PollType, PostSource, StarTargetType } from 'generated/prisma/client'
import { decompress } from '@/app/api/builds/builds.service'
import { prisma } from '@/lib/prisma'
import { AUTHOR_WITH_BADGES_SELECT } from '@/utils/user-select'

const authorInclude = { select: AUTHOR_WITH_BADGES_SELECT } as const

export type PollInput = {
	question: string
	type: 'single' | 'multiple'
	options: string[]
}

export type PostWriteInput = {
	title?: string | null
	content: string
	image_urls?: string[]
	poll?: PollInput
	attached_build_ids?: number[]
	attached_tier_list_ids?: number[]
}

function toPollType(type: PollInput['type']): PollType {
	return type === 'multiple' ? PollType.MULTIPLE : PollType.SINGLE
}

export function validatePoll(poll?: PollInput): string | null {
	if (!poll) return null
	if (poll.options.length < 2 || poll.options.length > 10)
		return 'Poll must contain 2 to 10 options'
	if (poll.options.some((option) => !option.trim()))
		return 'Poll options must not be empty'
	if (
		new Set(poll.options.map((option) => option.trim())).size !==
		poll.options.length
	)
		return 'Poll options must be unique'
	return null
}

function uniqueIds(ids: number[] | undefined): number[] {
	return [
		...new Set(
			(ids ?? []).filter((id) => Number.isSafeInteger(id) && id > 0)
		),
	]
}

function excerpt(content: string): string {
	return content.length > 200 ? `${content.slice(0, 197)}...` : content
}

async function validateAttachments(
	author_id: number,
	buildIds: number[],
	tierListIds: number[]
) {
	const [builds, tierLists] = await Promise.all([
		prisma.build.findMany({
			where: { id: { in: buildIds } },
			select: { id: true },
		}),
		prisma.tierList.findMany({
			where: {
				id: { in: tierListIds },
				OR: [{ author_id }, { is_public: true, removed_at: null }],
			},
			select: { id: true },
		}),
	])
	if (
		builds.length !== buildIds.length ||
		tierLists.length !== tierListIds.length
	)
		return 'One or more attached items are unavailable'
	return null
}

async function attachmentProjections(
	buildIds: number[],
	tierListIds: number[]
) {
	const [builds, tierLists] = await Promise.all([
		prisma.build.findMany({
			where: { id: { in: buildIds } },
			include: { author: authorInclude },
		}),
		prisma.tierList.findMany({
			where: { id: { in: tierListIds } },
			include: {
				author: authorInclude,
				_count: { select: { entries: true } },
				entries: {
					select: { item_id: true, rank: true },
					orderBy: { position: 'asc' },
					take: 60,
				},
			},
		}),
	])
	return {
		attached_builds: builds.map((build) => ({
			id: build.id,
			external_id: build.external_id,
			title: build.title,
			data: decompress(build.data),
			flags: build.flags,
			tags: build.tags ? build.tags.split(',').filter(Boolean) : [],
			views: build.views,
			stars_count: build.stars_count,
			comments_count: build.comments_count,
			author: build.author,
			created_at: build.created_at,
			updated_at: build.updated_at,
		})),
		attached_tier_lists: tierLists.map((tierList) => ({
			id: tierList.id,
			external_id: tierList.external_id,
			title: tierList.title,
			description: tierList.description,
			kind: tierList.kind,
			item_kind: tierList.item_kind,
			scenario: tierList.scenario,
			category: tierList.category,
			views: tierList.views,
			is_public: tierList.is_public,
			is_current: tierList.is_current,
			generated_at: tierList.generated_at,
			removed_at: tierList.removed_at,
			stars_count: tierList.stars_count,
			comments_count: tierList.comments_count,
			entry_count: tierList._count.entries,
			entries: tierList.entries.map((entry) => ({
				item_id: entry.item_id,
				rank: entry.rank,
			})),
			author: tierList.author,
			created_at: tierList.created_at,
			updated_at: tierList.updated_at,
		})),
	}
}

async function pollProjection(
	poll: {
		id: number
		question: string
		type: PollType
		options: { id: number; text: string; votes_count: number }[]
	} | null,
	user_id?: number
) {
	if (!poll) return null
	const myVotes = user_id
		? await prisma.postPollVote.findMany({
				where: {
					user_id,
					option_id: { in: poll.options.map((option) => option.id) },
				},
				select: { option_id: true },
			})
		: []
	return {
		id: poll.id,
		question: poll.question,
		type: poll.type === PollType.MULTIPLE ? 'multiple' : 'single',
		options: poll.options,
		total_votes: poll.options.reduce(
			(sum, option) => sum + option.votes_count,
			0
		),
		my_vote_option_ids: myVotes.map((vote) => vote.option_id),
	}
}

async function postProjection(postId: number, user_id?: number) {
	const post = await prisma.post.findUnique({
		where: { id: postId },
		include: {
			author: { select: AUTHOR_WITH_BADGES_SELECT },
			edited_by: { select: { id: true, username: true } },
			poll: { include: { options: { orderBy: { id: 'asc' } } } },
			repost_of: {
				include: {
					author: {
						select: { id: true, name: true, username: true },
					},
				},
			},
		},
	})
	if (!post) return null
	const [star, attachments, poll] = await Promise.all([
		user_id
			? prisma.star.findUnique({
					where: {
						target_type_target_id_user_id: {
							target_type: StarTargetType.POST,
							target_id: post.id,
							user_id,
						},
					},
				})
			: Promise.resolve(null),
		attachmentProjections(
			post.attached_build_ids,
			post.attached_tier_list_ids
		),
		pollProjection(post.poll, user_id),
	])
	return {
		id: post.id,
		external_id: post.external_id,
		title: post.title,
		content: post.content,
		image_urls: post.image_urls,
		source: post.source,
		author: post.author,
		author_name: post.author_name,
		edited_by:
			post.edited_by_id &&
			(post.edited_by?.username || post.edited_by_name)
				? {
						id: post.edited_by_id,
						username:
							post.edited_by?.username ?? post.edited_by_name,
					}
				: null,
		stars_count: post.stars_count,
		comments_count: post.comments_count,
		is_starred: !!star,
		poll,
		...attachments,
		repost_of: post.repost_of
			? {
					external_id: post.repost_of.external_id,
					title: post.repost_of.title,
					content: excerpt(post.repost_of.content),
					image_urls: post.repost_of.image_urls,
					author: post.repost_of.author,
					author_name: post.repost_of.author_name,
					created_at: post.repost_of.created_at,
				}
			: null,
		created_at: post.created_at,
		updated_at: post.updated_at,
	}
}

class PostsService {
	async create(
		author_id: number,
		data: PostWriteInput & {
			source?: PostSource
			external_key?: string | null
			author_name?: string | null
		}
	) {
		const buildIds = uniqueIds(data.attached_build_ids)
		const tierListIds = uniqueIds(data.attached_tier_list_ids)
		const attachmentError = await validateAttachments(
			author_id,
			buildIds,
			tierListIds
		)
		if (attachmentError) return { error: attachmentError as string }
		const pollError = validatePoll(data.poll)
		if (pollError) return { error: pollError }
		try {
			const post = await prisma.$transaction(async (tx) => {
				const created = await tx.post.create({
					data: {
						external_id: crypto.randomUUID().slice(0, 8),
						title: data.title ?? null,
						content: data.content,
						image_urls: data.image_urls ?? [],
						source: data.source ?? PostSource.USER,
						external_key: data.external_key ?? null,
						author_name: data.author_name ?? null,
						author_id,
						attached_build_ids: buildIds,
						attached_tier_list_ids: tierListIds,
					},
				})
				if (data.poll) {
					await tx.postPoll.create({
						data: {
							post_id: created.id,
							question: data.poll.question,
							type: toPollType(data.poll.type),
							options: {
								create: data.poll.options.map((text) => ({
									text: text.trim(),
								})),
							},
						},
					})
				}
				return created
			})
			return await postProjection(post.id)
		} catch (error) {
			if ((error as { code?: string }).code === 'P2002')
				return { created: false }
			throw error
		}
	}

	async createIngest(data: {
		source: PostSource
		external_key: string
		content: string
		image_urls?: string[]
		author_name?: string
	}) {
		const existing = await prisma.post.findUnique({
			where: {
				source_external_key: {
					source: data.source,
					external_key: data.external_key,
				},
			},
		})
		if (existing)
			return { created: false, post: await postProjection(existing.id) }
		try {
			const post = await prisma.post.create({
				data: {
					external_id: crypto.randomUUID().slice(0, 8),
					content: data.content,
					image_urls: data.image_urls ?? [],
					source: data.source,
					external_key: data.external_key,
					author_name: data.author_name ?? null,
				},
			})
			return { created: true, post: await postProjection(post.id) }
		} catch (error) {
			if ((error as { code?: string }).code === 'P2002') {
				const post = await prisma.post.findUniqueOrThrow({
					where: {
						source_external_key: {
							source: data.source,
							external_key: data.external_key,
						},
					},
				})
				return { created: false, post: await postProjection(post.id) }
			}
			throw error
		}
	}

	async getById(id: string, user_id?: number, is_admin = false) {
		const post = await postProjectionByExternalId(id, user_id)
		if (post && is_admin) return { ...post, can_manage: true as const }
		return post
	}

	async update(
		external_id: string,
		actor_id: number,
		is_admin: boolean,
		data: PostWriteInput
	) {
		const existing = await prisma.post.findUnique({
			where: { external_id },
		})
		if (!existing) return null
		if (existing.author_id !== actor_id && !is_admin)
			return { error: 'Forbidden' as const }
		const buildIds = uniqueIds(
			data.attached_build_ids ?? existing.attached_build_ids
		)
		const tierListIds = uniqueIds(
			data.attached_tier_list_ids ?? existing.attached_tier_list_ids
		)
		const attachmentError = await validateAttachments(
			actor_id,
			buildIds,
			tierListIds
		)
		if (attachmentError) return { error: attachmentError }
		// Editing someone else's post (admin): record who made the change
		const editedBy =
			existing.author_id !== actor_id
				? {
						edited_by_id: actor_id,
						edited_by_name: await prisma.user
							.findUnique({
								where: { id: actor_id },
								select: { username: true },
							})
							.then((user) => user?.username ?? null),
					}
				: {}
		const post = await prisma.post.update({
			where: { id: existing.id },
			data: {
				...(data.title !== undefined && { title: data.title }),
				...(data.content !== undefined && { content: data.content }),
				...(data.image_urls !== undefined && {
					image_urls: data.image_urls,
				}),
				...(data.attached_build_ids !== undefined && {
					attached_build_ids: buildIds,
				}),
				...(data.attached_tier_list_ids !== undefined && {
					attached_tier_list_ids: tierListIds,
				}),
				...editedBy,
			},
		})
		return postProjection(post.id, actor_id)
	}

	async createRepost(
		external_id: string,
		author_id: number,
		content?: string
	) {
		const original = await prisma.post.findUnique({
			where: { external_id },
			include: { poll: { include: { options: true } } },
		})
		if (!original) return null
		const repost = await prisma.$transaction(async (tx) => {
			const created = await tx.post.create({
				data: {
					external_id: crypto.randomUUID().slice(0, 8),
					title: content?.trim() ? null : original.title,
					content: content?.trim() ?? '',
					author_id,
					repost_of_id: original.id,
				},
			})
			return created
		})
		return postProjection(repost.id, author_id)
	}

	async delete(external_id: string, author_id: number, is_admin: boolean) {
		const existing = await prisma.post.findUnique({
			where: { external_id },
		})
		if (!existing) return false
		if (existing.author_id !== author_id && !is_admin) return false
		await prisma.post.delete({ where: { id: existing.id } })
		return true
	}

	async addStar(external_id: string, user_id: number) {
		const post = await prisma.post.findUnique({
			where: { external_id },
			select: { id: true },
		})
		if (!post) return false
		try {
			await prisma.$transaction(async (tx) => {
				await tx.star.create({
					data: {
						target_type: StarTargetType.POST,
						target_id: post.id,
						user_id,
					},
				})
				await tx.post.update({
					where: { id: post.id },
					data: { stars_count: { increment: 1 } },
				})
			})
		} catch (error) {
			if ((error as { code?: string }).code !== 'P2002') throw error
		}
		return true
	}

	async removeStar(external_id: string, user_id: number) {
		const post = await prisma.post.findUnique({
			where: { external_id },
			select: { id: true },
		})
		if (!post) return false
		await prisma.$transaction(async (tx) => {
			const result = await tx.star.deleteMany({
				where: {
					target_type: StarTargetType.POST,
					target_id: post.id,
					user_id,
				},
			})
			if (result.count)
				await tx.post.update({
					where: { id: post.id },
					data: { stars_count: { decrement: result.count } },
				})
		})
		return true
	}

	async vote(external_id: string, user_id: number, option_ids: number[]) {
		const post = await prisma.post.findUnique({
			where: { external_id },
			include: { poll: { include: { options: true } } },
		})
		if (!post?.poll) return { error: 'Poll not found' as const }
		const selected = uniqueIds(option_ids)
		const optionIds = new Set(post.poll.options.map((option) => option.id))
		if (selected.some((id) => !optionIds.has(id)))
			return { error: 'Invalid poll option' as const }
		if (post.poll.type === PollType.SINGLE && selected.length !== 1)
			return {
				error: 'Single-choice polls require exactly one option' as const,
			}
		if (post.poll.type === PollType.MULTIPLE && selected.length < 1)
			return { error: 'Select at least one option' as const }
		await prisma.$transaction(async (tx) => {
			const oldVotes = await tx.postPollVote.findMany({
				where: { user_id, option: { poll_id: post.poll!.id } },
				select: { option_id: true },
			})
			await tx.postPollVote.deleteMany({
				where: { user_id, option: { poll_id: post.poll!.id } },
			})
			for (const old of oldVotes)
				await tx.postPollOption.update({
					where: { id: old.option_id },
					data: { votes_count: { decrement: 1 } },
				})
			await tx.postPollVote.createMany({
				data: selected.map((option_id) => ({ option_id, user_id })),
			})
			for (const option_id of selected)
				await tx.postPollOption.update({
					where: { id: option_id },
					data: { votes_count: { increment: 1 } },
				})
		})
		return { post: await postProjection(post.id, user_id) }
	}

	async retractVote(external_id: string, user_id: number) {
		const post = await prisma.post.findUnique({
			where: { external_id },
			include: { poll: true },
		})
		if (!post?.poll) return { error: 'Poll not found' as const }
		await prisma.$transaction(async (tx) => {
			const oldVotes = await tx.postPollVote.findMany({
				where: { user_id, option: { poll_id: post.poll!.id } },
				select: { option_id: true },
			})
			await tx.postPollVote.deleteMany({
				where: { user_id, option: { poll_id: post.poll!.id } },
			})
			for (const old of oldVotes)
				await tx.postPollOption.update({
					where: { id: old.option_id },
					data: { votes_count: { decrement: 1 } },
				})
		})
		return { post: await postProjection(post.id, user_id) }
	}

	async deletePoll(external_id: string, author_id: number) {
		const post = await prisma.post.findUnique({
			where: { external_id },
			include: { poll: true },
		})
		if (!post) return { error: 'Post not found' as const }
		if (post.author_id !== author_id) return { error: 'Forbidden' as const }
		if (post.poll)
			await prisma.postPoll.delete({ where: { id: post.poll.id } })
		return { success: true as const }
	}
}

async function postProjectionByExternalId(
	external_id: string,
	user_id?: number
) {
	const post = await prisma.post.findUnique({
		where: { external_id },
		select: { id: true },
	})
	return post ? postProjection(post.id, user_id) : null
}

export const postsService = new PostsService()
export { postProjection }
