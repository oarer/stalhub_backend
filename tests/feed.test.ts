import { afterAll, beforeAll, expect, test } from 'bun:test'
import { PostSource } from 'generated/prisma/client'

const enabled = process.env.STALHUB_FEED_TEST === '1'
let db: typeof import('../src/lib/prisma').prisma
let feedService: typeof import('../src/app/api/feed/feed.service').feedService
let buildsService: typeof import('../src/app/api/builds/builds.service').buildsService
let tierListsService: typeof import('../src/app/api/tier-lists/tier-lists.service').tierListsService
let postsService: typeof import('../src/app/api/posts/posts.service').postsService
let usersService: typeof import('../src/app/api/users/users.service').usersService
let syncTelegramSources: typeof import('../src/app/api/feed-sources/telegram').syncTelegramSources
let htmlToText: typeof import('../src/app/api/feed-sources/telegram').htmlToText
let userId = 0
let commenterId = 0
let buildId = 0
let tierListId = 0
let postExternalId = ''
let telegramSourceId = 0
let telegramExternalId = ''
const prefix = `feed_${Date.now()}`

beforeAll(async () => {
	if (!enabled) return
	const url = new URL(process.env.DATABASE_URL ?? '')
	if (
		!['localhost', '127.0.0.1'].includes(url.hostname) ||
		url.pathname !== '/stalhub_feed_test'
	) {
		throw new Error('Disposable feed test database required')
	}
	db = (await import('../src/lib/prisma')).prisma
	feedService = (await import('../src/app/api/feed/feed.service')).feedService
	buildsService = (await import('../src/app/api/builds/builds.service'))
		.buildsService
	tierListsService = (
		await import('../src/app/api/tier-lists/tier-lists.service')
	).tierListsService
	postsService = (await import('../src/app/api/posts/posts.service'))
		.postsService
	usersService = (await import('../src/app/api/users/users.service'))
		.usersService
	syncTelegramSources = (await import('../src/app/api/feed-sources/telegram'))
		.syncTelegramSources
	htmlToText = (await import('../src/app/api/feed-sources/telegram'))
		.htmlToText
	const { env } = await import('../src/env')
	env.RSSHUB_BASE_URL = 'http://rsshub.test'
	const user = await db.user.create({ data: { username: `${prefix}_user` } })
	userId = user.id
	const commenter = await db.user.create({
		data: { username: `${prefix}_commenter` },
	})
	commenterId = commenter.id
	const build = await db.build.create({
		data: {
			external_id: `${prefix}_build`,
			title: 'Feed build',
			data: '{}',
			author_id: userId,
		},
	})
	buildId = build.id
	const tierList = await db.tierList.create({
		data: {
			external_id: `${prefix}_tier`,
			title: 'Feed tier list',
			author_id: userId,
			is_public: true,
		},
	})
	tierListId = tierList.id
	const post = await postsService.create(userId, {
		content: 'Feed post',
		title: 'Post title',
	})
	if (!post || !('external_id' in post))
		throw new Error('Failed to create test post')
	postExternalId = post.external_id
	await db.art.create({
		data: {
			external_id: `${prefix}_art`,
			title: 'Feed art',
			image_url: '/uploads/arts/feed.png',
			image_urls: ['/uploads/arts/feed.png'],
			author_id: userId,
		},
	})
	telegramExternalId = `${prefix}_tg`
	const telegramSource = await db.feedSource.create({
		data: {
			type: 'TG',
			external_id: telegramExternalId,
			label: 'Test Telegram',
		},
	})
	telegramSourceId = telegramSource.id
})

afterAll(async () => {
	if (!enabled) return
	await db.post.deleteMany({
		where: {
			source: PostSource.TG,
			external_key: { startsWith: `tg:${telegramExternalId}:` },
		},
	})
	if (telegramSourceId)
		await db.feedSource.delete({ where: { id: telegramSourceId } })
	await db.user.delete({ where: { id: userId } })
	await db.user.delete({ where: { id: commenterId } })
})

if (!enabled) {
	test.skip('feed integration tests require STALHUB_FEED_TEST=1')
} else {
	test('paginates and filters the unified feed', async () => {
		const page = await feedService.list({
			page: 0,
			take: 1,
			sort: 'new',
		})
		expect(page.data[0].is_starred).toBe(false)
		expect(page.total_count).toBe(4)
		expect(page.data).toHaveLength(1)
		expect(page.page).toBe(1)

		const tier = await feedService.list({
			types: ['tier_list'],
			page: 0,
			take: 24,
			sort: 'new',
		})
		expect(tier.data).toHaveLength(1)
		expect(tier.data[0].type).toBe('tier_list')
		const mixed = await feedService.list({
			page: 0,
			take: 24,
			sort: 'new',
		})
		expect(new Set(mixed.data.map((item) => item.type))).toEqual(
			new Set(['build', 'tier_list', 'post', 'art'])
		)
	})

	test('types checklist returns exactly the selected content types', async () => {
		const onlyBuildsAndPosts = await feedService.list({
			types: ['build', 'post'],
			page: 0,
			take: 24,
			sort: 'new',
		})
		expect(
			new Set(onlyBuildsAndPosts.data.map((item) => item.type))
		).toEqual(new Set(['build', 'post']))
		expect(onlyBuildsAndPosts.total_count).toBe(2)

		const allTypes = await feedService.list({
			types: ['build', 'tier_list', 'post', 'art'],
			page: 0,
			take: 24,
			sort: 'new',
		})
		expect(allTypes.total_count).toBe(4)
	})

	test('comments update counters and notify the content author', async () => {
		const commentsService = (
			await import('../src/app/api/articles/comments/comments.service')
		).commentsService
		const buildComment = await commentsService.createForBuild(
			buildId,
			commenterId,
			{ content: 'Build comment' }
		)
		const tierComment = await commentsService.createForTierList(
			tierListId,
			commenterId,
			{ content: 'Tier comment' }
		)
		expect(buildComment).not.toBeNull()
		expect(tierComment).not.toBeNull()
		const [build, tierList] = await Promise.all([
			db.build.findUniqueOrThrow({ where: { id: buildId } }),
			db.tierList.findUniqueOrThrow({ where: { id: tierListId } }),
		])
		expect(build.comments_count).toBe(1)
		expect(tierList.comments_count).toBe(1)
		const notification = await db.notifications.findFirst({
			where: {
				users: { some: { id: userId } },
				title: 'Новый комментарий',
			},
		})
		expect(notification).not.toBeNull()
		await commentsService.delete(
			buildComment?.id ?? 0,
			commenterId,
			false,
			'build'
		)
		await commentsService.delete(
			tierComment?.id ?? 0,
			commenterId,
			false,
			'tier_list'
		)
		const [buildAfterDelete, tierAfterDelete] = await Promise.all([
			db.build.findUniqueOrThrow({ where: { id: buildId } }),
			db.tierList.findUniqueOrThrow({ where: { id: tierListId } }),
		])
		expect(buildAfterDelete.comments_count).toBe(0)
		expect(tierAfterDelete.comments_count).toBe(0)
	})

	test('stars tier lists uniquely and includes them in getStars', async () => {
		await tierListsService.addStar(tierListId, userId)
		await tierListsService.addStar(tierListId, userId)
		const tier = await db.tierList.findUniqueOrThrow({
			where: { id: tierListId },
		})
		expect(tier.stars_count).toBe(1)
		const stars = await usersService.getStars(userId, 24, 0)
		expect(stars.data.some((item) => item?.type === 'tier_list')).toBe(true)
		await tierListsService.removeStar(tierListId, userId)
		const unstarred = await db.tierList.findUniqueOrThrow({
			where: { id: tierListId },
		})
		expect(unstarred.stars_count).toBe(0)
	})

	test('posts support details, stars, comments, and ownership checks', async () => {
		const post = await postsService.getById(postExternalId)
		expect(post?.content).toBe('Feed post')
		await postsService.addStar(postExternalId, commenterId)
		await postsService.addStar(postExternalId, commenterId)
		const starred = await db.post.findUniqueOrThrow({
			where: { external_id: postExternalId },
		})
		expect(starred.stars_count).toBe(1)
		const commentsService = (
			await import('../src/app/api/articles/comments/comments.service')
		).commentsService
		const comment = await commentsService.createForPost(
			postExternalId,
			commenterId,
			{ content: 'Post comment' }
		)
		expect(comment).not.toBeNull()
		const withComment = await db.post.findUniqueOrThrow({
			where: { external_id: postExternalId },
		})
		expect(withComment.comments_count).toBe(1)
		const forbidden = await postsService.update(
			postExternalId,
			commenterId,
			false,
			{ content: 'nope' }
		)
		expect(forbidden).toEqual({ error: 'Forbidden' })
		await commentsService.delete(
			comment?.id ?? 0,
			commenterId,
			false,
			'post'
		)
		await postsService.removeStar(postExternalId, commenterId)
	})

	test('polls replace and retract votes, and reposts retain attribution', async () => {
		const created = await postsService.create(userId, {
			content: 'Poll post',
			poll: {
				question: 'Choose',
				type: 'multiple',
				options: ['A', 'B', 'C'],
			},
			attached_build_ids: [buildId],
			attached_tier_list_ids: [tierListId],
		})
		if (!created || !('external_id' in created))
			throw new Error('Poll post failed')
		const poll = await db.postPoll.findUniqueOrThrow({
			where: { post_id: created.id },
			include: { options: { orderBy: { id: 'asc' } } },
		})
		const first = await postsService.vote(
			created.external_id,
			commenterId,
			[poll.options[0].id, poll.options[1].id]
		)
		expect('error' in first).toBe(false)
		const second = await postsService.vote(
			created.external_id,
			commenterId,
			[poll.options[1].id]
		)
		expect('error' in second).toBe(false)
		const options = await db.postPollOption.findMany({
			orderBy: { id: 'asc' },
		})
		expect(options.filter((option) => option.votes_count > 0)).toHaveLength(
			1
		)
		await postsService.retractVote(created.external_id, commenterId)
		const retracted = await db.postPollOption.findMany({
			orderBy: { id: 'asc' },
		})
		expect(retracted.every((option) => option.votes_count === 0)).toBe(true)
		const repost = await postsService.createRepost(
			created.external_id,
			commenterId,
			'My repost'
		)
		expect(repost?.repost_of?.external_id).toBe(created.external_id)
		expect(repost?.attached_builds).toHaveLength(1)
	})

	test('internal media upload accepts multipart images', async () => {
		const { env } = await import('../src/env')
		if (!env.DISCORD_BOT_SERVICE_JWT) return
		const { internalRoutes } = await import('../src/app/api/internal')
		const { createElysia } = await import('../src/utils/elysia')
		const { deleteUpload } = await import('../src/lib/uploads')
		const app = createElysia({ prefix: '/api/v1' }).use(internalRoutes)
		const form = new FormData()
		form.append(
			'file',
			new File([Buffer.from('89504e470d0a1a0a', 'hex')], 'pixel.png', {
				type: 'image/png',
			})
		)
		const response = await app.handle(
			new Request('http://localhost/api/v1/internal/feed-posts/media', {
				method: 'POST',
				headers: { 'x-bot-secret': env.DISCORD_BOT_SERVICE_JWT },
				body: form,
			})
		)
		expect(response.status).toBe(200)
		const result = (await response.json()) as { image_url: string }
		expect(result.image_url).toMatch(/^\/uploads\/feed\//)
		await deleteUpload(result.image_url)
	})

	test('internal ingest deduplicates automatic posts', async () => {
		const first = await postsService.createIngest({
			source: PostSource.TG,
			external_key: `${prefix}:ingest`,
			content: 'Imported post',
			author_name: 'Bot source',
			source_url: 'https://t.me/bot_source',
			source_avatar_url: 'https://cdn.test/bot_source.jpg',
		})
		const second = await postsService.createIngest({
			source: PostSource.TG,
			external_key: `${prefix}:ingest`,
			content: 'Duplicate post',
		})
		expect(first.created).toBe(true)
		expect(first.post?.source_url).toBe('https://t.me/bot_source')
		expect(first.post?.source_avatar_url).toBe(
			'https://cdn.test/bot_source.jpg'
		)
		expect(second.created).toBe(false)
		expect(second.post?.content).toBe('Imported post')
	})

	test('syncs Telegram RSSHub feeds with a baseline and later posts', async () => {
		const originalFetch = globalThis.fetch
		let requestCount = 0
		globalThis.fetch = (async (input) => {
			expect(String(input)).toBe(
				`http://rsshub.test/telegram/channel/${telegramExternalId}?format=json`
			)
			requestCount += 1
			const items =
				requestCount === 1
					? [
							{
								title: 'Old title',
								content_html:
									'<p>Old body</p><figure><img src="https://img.test/old.jpg"></figure>',
								url: `https://t.me/${telegramExternalId}/41`,
								date_published: '2026-01-01T00:00:00.000Z',
								authors: [{ name: 'Test channel' }],
							},
						]
					: [
							{
								title: 'Old title',
								content_html: '<p>Old body</p>',
								url: `https://t.me/${telegramExternalId}/41`,
								date_published: '2026-01-01T00:00:00.000Z',
							},
							{
								title: 'New title',
								content_html:
									'<p>New &amp; body<br>second line</p><figure><img src="https://img.test/new.jpg"></figure>',
								url: `https://t.me/${telegramExternalId}/42`,
								date_published: '2026-01-02T00:00:00.000Z',
								authors: [{ name: 'Test channel' }],
							},
						]
			return new Response(
				JSON.stringify({
					icon: 'https://cdn.test/channel.jpg',
					items,
				}),
				{ status: 200 }
			)
		}) as typeof fetch
		try {
			const baseline = await syncTelegramSources([telegramSourceId])
			expect(baseline.synced).toBe(0)
			expect(baseline.errors).toEqual([])
			const afterBaseline = await db.feedSource.findUniqueOrThrow({
				where: { id: telegramSourceId },
			})
			expect(afterBaseline.last_synced_at?.toISOString()).toBe(
				'2026-01-01T00:00:00.000Z'
			)

			const update = await syncTelegramSources([telegramSourceId])
			expect(update.synced).toBe(1)
			expect(update.errors).toEqual([])
			const post = await db.post.findUniqueOrThrow({
				where: {
					source_external_key: {
						source: PostSource.TG,
						external_key: `tg:${telegramExternalId}:42`,
					},
				},
			})
			expect(post.content).toBe('New title\n\nNew & body\nsecond line')
			expect(post.image_urls).toEqual(['https://img.test/new.jpg'])
			expect(post.author_name).toBe('Test channel')
			expect(post.source_url).toBe(`https://t.me/${telegramExternalId}`)
			expect(post.source_avatar_url).toBe('https://cdn.test/channel.jpg')
			expect(
				htmlToText(
					'<p>Hello &amp; <b>world</b><br>next</p><figure><img src="https://img.test/x.jpg"></figure>'
				)
			).toBe('Hello & world\nnext')
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	test('hide-from-feed excludes content and requires ownership', async () => {
		expect(await buildsService.hideFromFeed(buildId, commenterId)).toBe(
			false
		)
		expect(await buildsService.hideFromFeed(buildId, userId)).toBe(true)
		const hidden = await feedService.list({
			types: ['build'],
			page: 0,
			take: 24,
			sort: 'new',
		})
		expect(
			hidden.data.some(
				(item) => item.type === 'build' && item.build.id === buildId
			)
		).toBe(false)
		expect(await buildsService.showInFeed(buildId, userId)).toBe(true)
	})

	test('sorts top items and resolves is_starred for an authorized user', async () => {
		await buildsService.addStar(buildId, userId)
		await tierListsService.addStar(tierListId, userId)
		await postsService.addStar(postExternalId, userId)
		const art = await db.art.findFirstOrThrow({
			where: { external_id: `${prefix}_art` },
		})
		await db.star.create({
			data: {
				target_type: 'ART',
				target_id: art.id,
				user_id: userId,
			},
		})
		const top = await feedService.list({
			page: 0,
			take: 24,
			sort: 'top',
			user_id: userId,
		})
		expect(top.data.every((item) => item.is_starred)).toBe(true)
		expect(top.data[0].stars_count).toBeGreaterThanOrEqual(
			top.data[1].stars_count
		)
	})

	test('separates user posts from eforum posts', async () => {
		const eforumPost = await db.post.create({
			data: {
				external_id: `${prefix}_eforum`,
				content: 'Forum post',
				author_id: userId,
				source: PostSource.EFORUM,
			},
		})

		const onlyUserPosts = await feedService.list({
			types: ['post'],
			page: 0,
			take: 24,
			sort: 'new',
		})
		expect(
			onlyUserPosts.data.every(
				(item) => item.type === 'post' && item.post.source === 'USER'
			)
		).toBe(true)
		expect(
			onlyUserPosts.data.some(
				(item) => item.type === 'post' && item.post.source === 'EFORUM'
			)
		).toBe(false)

		const onlyEforumPosts = await feedService.list({
			types: ['eforum'],
			page: 0,
			take: 24,
			sort: 'new',
		})
		expect(onlyEforumPosts.data).toHaveLength(1)
		expect(onlyEforumPosts.data[0].type).toBe('post')
		expect(
			onlyEforumPosts.data.every(
				(item) => item.type === 'post' && item.post.source === 'EFORUM'
			)
		).toBe(true)

		const both = await feedService.list({
			types: ['post', 'eforum'],
			page: 0,
			take: 24,
			sort: 'new',
		})
		expect(both.data.filter((item) => item.type === 'post')).toHaveLength(2)
		expect(
			new Set(
				both.data
					.filter((item) => item.type === 'post')
					.map((item) => item.post.source)
			)
		).toEqual(new Set(['USER', 'EFORUM']))

		await db.post.delete({ where: { id: eforumPost.id } })
	})
}
