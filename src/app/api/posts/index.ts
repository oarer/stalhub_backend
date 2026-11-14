import { t } from 'elysia'
import { PostSource } from 'generated/prisma/client'
import { postCommentsRoutes } from '@/app/api/feed/comments'
import {
	checkPermission,
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { enforceContentSpam, SPAM_LIMIT_ARTICLE } from '@/utils/auto-ban'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { rejectOnXss } from '@/utils/xss-guard'
import {
	type PollInput,
	type PostWriteInput,
	postsService,
	validatePoll,
} from './posts.service'

const pollBody = t.Object({
	question: t.String({ maxLength: 500 }),
	type: t.Union([t.Literal('single'), t.Literal('multiple')]),
	options: t.Array(t.String({ maxLength: 200 }), {
		minItems: 2,
		maxItems: 10,
	}),
})

const postBody = t.Object({
	title: t.Optional(t.String({ maxLength: 200 })),
	content: t.String({ maxLength: 50000 }),
	image_urls: t.Optional(
		t.Array(t.String({ maxLength: 2000 }), { maxItems: 10 })
	),
	poll: t.Optional(pollBody),
	attached_build_ids: t.Optional(t.Array(t.Integer(), { maxItems: 20 })),
	attached_tier_list_ids: t.Optional(t.Array(t.Integer(), { maxItems: 20 })),
})

function ipOf(request: Request) {
	return (
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		request.headers.get('x-real-ip') ??
		'?'
	)
}

function xssFields(body: { title?: string | null; content?: string }) {
	return { title: body.title, content: body.content }
}

function toWriteInput(body: unknown): PostWriteInput {
	return body as PostWriteInput
}

export const postsRoutes = createElysia().group('/posts', (app) =>
	app
		.use(jwtPlugin)
		.post(
			'',
			{ beforeHandle: [requireAuth], body: postBody },
			async ({ body, store, set, request }) => {
				const { user_id } = fromStore(store)
				const xss = await rejectOnXss({
					fields: xssFields(body),
					user_id,
					ip: ipOf(request),
					route: 'POST /posts',
				})
				if (xss) {
					set.status = 400
					return { error: `Invalid content in field: ${xss.field}` }
				}
				await enforceContentSpam(user_id, SPAM_LIMIT_ARTICLE)
				const pollError = validatePoll(
					body.poll as PollInput | undefined
				)
				if (pollError) {
					set.status = 400
					return { error: pollError }
				}
				const result = await postsService.create(
					user_id,
					toWriteInput(body)
				)
				if (!result) {
					set.status = 500
					return { error: 'Post creation failed' }
				}
				if ('error' in result) {
					set.status = 400
					return result
				}
				return { post: result }
			}
		)
		.get(
			'/:id',
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ id: t.String() }),
			},
			async ({ params, store, set }) => {
				const { user_id } = fromStoreOpt(store)
				const is_admin = user_id
					? await checkPermission(user_id, 'user:manage')
					: false
				const post = await postsService.getById(
					params.id,
					user_id,
					is_admin
				)
				if (!post) {
					set.status = 404
					return { error: 'Post not found' }
				}
				return { post }
			}
		)
		.patch(
			'/:id',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					title: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
					content: t.Optional(t.String({ maxLength: 50000 })),
					image_urls: t.Optional(
						t.Array(t.String({ maxLength: 2000 }), { maxItems: 10 })
					),
					attached_build_ids: t.Optional(
						t.Array(t.Integer(), { maxItems: 20 })
					),
					attached_tier_list_ids: t.Optional(
						t.Array(t.Integer(), { maxItems: 20 })
					),
				}),
			},
			async ({ params, body, store, set, request }) => {
				const { user_id } = fromStore(store)
				const xss = await rejectOnXss({
					fields: xssFields(body),
					user_id,
					ip: ipOf(request),
					route: 'PATCH /posts/:id',
				})
				if (xss) {
					set.status = 400
					return { error: `Invalid content in field: ${xss.field}` }
				}
				if (body.content !== undefined)
					await enforceContentSpam(user_id, SPAM_LIMIT_ARTICLE)
				const result = await postsService.update(
					params.id,
					user_id,
					await checkPermission(user_id, 'user:manage'),
					body as PostWriteInput
				)
				if (!result) {
					set.status = 404
					return { error: 'Post not found' }
				}
				if ('error' in result) {
					set.status = 403
					return result
				}
				return { post: result }
			}
		)
		.delete(
			'/:id',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
			},
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const ok = await postsService.delete(
					params.id,
					user_id,
					await checkPermission(user_id, 'user:manage')
				)
				if (!ok) {
					set.status = 403
					return { error: 'Forbidden' }
				}
				return { success: true }
			}
		)
		.post(
			'/:id/repost',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					content: t.Optional(t.String({ maxLength: 50000 })),
				}),
			},
			async ({ params, body, store, set, request }) => {
				const { user_id } = fromStore(store)
				const xss = await rejectOnXss({
					fields: { content: body.content },
					user_id,
					ip: ipOf(request),
					route: 'POST /posts/:id/repost',
				})
				if (xss) {
					set.status = 400
					return { error: 'Invalid content' }
				}
				await enforceContentSpam(user_id, SPAM_LIMIT_ARTICLE)
				const post = await postsService.createRepost(
					params.id,
					user_id,
					body.content
				)
				if (!post) {
					set.status = 404
					return { error: 'Post not found' }
				}
				return { post }
			}
		)
		.post(
			'/:id/star',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
			},
			async ({ params, store, set }) => {
				const ok = await postsService.addStar(
					params.id,
					fromStore(store).user_id
				)
				if (!ok) {
					set.status = 404
					return { error: 'Post not found' }
				}
				return { success: true }
			}
		)
		.delete(
			'/:id/star',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
			},
			async ({ params, store, set }) => {
				const ok = await postsService.removeStar(
					params.id,
					fromStore(store).user_id
				)
				if (!ok) {
					set.status = 404
					return { error: 'Post not found' }
				}
				return { success: true }
			}
		)
		.post(
			'/:id/poll/vote',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					option_ids: t.Array(t.Integer(), {
						minItems: 1,
						maxItems: 10,
					}),
				}),
			},
			async ({ params, body, store, set }) => {
				const result = await postsService.vote(
					params.id,
					fromStore(store).user_id,
					body.option_ids
				)
				if ('error' in result) {
					set.status = result.error === 'Poll not found' ? 404 : 400
					return result
				}
				return result
			}
		)
		.delete(
			'/:id/poll/vote',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
			},
			async ({ params, store, set }) => {
				const result = await postsService.retractVote(
					params.id,
					fromStore(store).user_id
				)
				if ('error' in result) {
					set.status = 404
					return result
				}
				return result
			}
		)
		.delete(
			'/:id/poll',
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
			},
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const result = await postsService.deletePoll(params.id, user_id)
				if ('error' in result) {
					set.status = result.error === 'Post not found' ? 404 : 403
					return result
				}
				return result
			}
		)
		.use(postCommentsRoutes)
)

export { PostSource }
