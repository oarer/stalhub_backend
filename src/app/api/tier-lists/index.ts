import { t } from 'elysia'
import {
	checkPermission,
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { tierListsService } from './tier-lists.service'

export const tierListsRoutes = createElysia().group('/tier-lists', (app) =>
	app
		.use(jwtPlugin)

		.get(
			'',
			async ({ query, store }) => {
				return tierListsService.list({
					take: query.take ?? 24,
					page: (query.page ?? 1) - 1,
					kind: query.kind as 'SYSTEM' | 'USER' | undefined,
					item_kind: query.item_kind as
						| 'ARMOR'
						| 'WEAPON'
						| undefined,
					category: query.category as string | undefined,
					user_id: fromStoreOpt(store).user_id,
				})
			},
			{
				beforeHandle: [requireOptionalAuth],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					kind: t.Optional(
						t.Union([t.Literal('SYSTEM'), t.Literal('USER')])
					),
					item_kind: t.Optional(
						t.Union([t.Literal('ARMOR'), t.Literal('WEAPON')])
					),
					category: t.Optional(t.String()),
				}),
				detail: { tags: ['Tier Lists'] },
			}
		)

		.get(
			'mine',
			async ({ query, store }) => {
				return tierListsService.listMine(
					fromStore(store).user_id,
					query.take ?? 24,
					(query.page ?? 1) - 1
				)
			},
			{
				beforeHandle: [requireAuth],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
				}),
				detail: { tags: ['Tier Lists'] },
			}
		)

		.get(
			'/:id',
			async ({ params, store, request }) => {
				return tierListsService.getById(
					params.id,
					fromStoreOpt(store).user_id,
					{
						ip:
							request.headers
								.get('x-forwarded-for')
								?.split(',')[0]
								?.trim() ??
							request.headers.get('x-real-ip') ??
							undefined,
						userAgent:
							request.headers.get('user-agent') ?? undefined,
					}
				)
			},
			{
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Tier Lists'] },
			}
		)

		.post(
			'',
			async ({ body, store, set }) => {
				return tierListsService.create(fromStore(store).user_id, body)
			},
			{
				beforeHandle: [requireAuth],
				body: t.Object({
					title: t.String({ maxLength: 200 }),
					description: t.Optional(t.String({ maxLength: 2000 })),
					item_kind: t.Optional(
						t.Union([t.Literal('ARMOR'), t.Literal('WEAPON')])
					),
					is_public: t.Optional(t.Boolean()),
					scenario: t.Optional(t.String()),
					category: t.Optional(
						t.Union([
							t.Literal('general'),
							t.Literal('assault_rifle'),
							t.Literal('sniper_rifle'),
							t.Literal('shotgun_rifle'),
							t.Literal('submachine_gun'),
							t.Literal('machine_gun'),
							t.Literal('pistol'),
						])
					),
					entries: t.Optional(
						t.Array(
							t.Object({
								item_id: t.String(),
								rank: t.Union([
									t.Literal('S'),
									t.Literal('A'),
									t.Literal('B'),
									t.Literal('C'),
									t.Literal('D'),
									t.Literal('E'),
								]),
								position: t.Optional(t.Numeric()),
							})
						)
					),
				}),
				detail: { tags: ['Tier Lists'] },
			}
		)

		.patch(
			'/:id',
			async ({ params, body, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(
					user_id,
					'tier_lists:manage'
				)

				const result = await tierListsService.update(
					Number(params.id),
					user_id,
					is_admin,
					{
						...(body.title !== undefined && { title: body.title }),
						...(body.description !== undefined && {
							description: body.description,
						}),
						...(body.category !== undefined && {
							category: body.category,
						}),
						...(body.is_public !== undefined && {
							is_public: body.is_public,
						}),
						...(body.entries !== undefined && {
							entries: body.entries,
						}),
					}
				)

				if (!result) {
					set.status = 404
					return { error: 'Not found' }
				}
				if ('error' in result) {
					set.status = 403
					return result
				}

				return result
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				body: t.Object({
					title: t.Optional(t.String({ maxLength: 200 })),
					description: t.Optional(t.String({ maxLength: 2000 })),
					category: t.Optional(
						t.Union([
							t.Literal('general'),
							t.Literal('assault_rifle'),
							t.Literal('sniper_rifle'),
							t.Literal('shotgun_rifle'),
							t.Literal('submachine_gun'),
							t.Literal('machine_gun'),
							t.Literal('pistol'),
						])
					),
					is_public: t.Optional(t.Boolean()),
					entries: t.Optional(
						t.Array(
							t.Object({
								item_id: t.String(),
								rank: t.Union([
									t.Literal('S'),
									t.Literal('A'),
									t.Literal('B'),
									t.Literal('C'),
									t.Literal('D'),
									t.Literal('E'),
								]),
								position: t.Optional(t.Numeric()),
							})
						)
					),
				}),
				detail: { tags: ['Tier Lists'] },
			}
		)

		.delete(
			'/:id',
			async ({ params, store, set }) => {
				const { user_id } = fromStore(store)
				const is_admin = await checkPermission(
					user_id,
					'tier_lists:manage'
				)
				const ok = await tierListsService.delete(
					Number(params.id),
					user_id,
					is_admin
				)

				if (!ok) {
					set.status = 403
					return { error: 'Forbidden' }
				}

				return { success: true }
			},
			{
				beforeHandle: [requireAuth],
				params: t.Object({ id: t.String() }),
				detail: { tags: ['Tier Lists'] },
			}
		)
)
