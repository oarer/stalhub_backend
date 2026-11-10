import { t } from 'elysia'
import { ZodError } from 'zod'
import { type AuthContext, fromStore, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { arbitration } from '../../commissions/arbitration'
import { permissions } from '../../commissions/data'
import { CommissionError } from '../../commissions/policy'
import { caseCommandSchema } from '../../commissions/schemas'
import {
	disputeFile,
	disputeMessages,
	disputeStats,
	getDispute,
	listDisputes,
} from './disputes.service'

async function requireDisputeAdmin({ store, set }: AuthContext) {
	const actor = fromStore(store).user_id
	const access = await permissions(actor)
	if (access.manage || access.owner) return
	set.status = 403
	return { error: 'Forbidden' }
}

const params = t.Object({
	id: t.String({ minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' }),
})
const fileParams = t.Object({
	id: t.String({ minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' }),
	fileId: t.String({
		minLength: 1,
		maxLength: 100,
		pattern: '^[a-zA-Z0-9_-]+$',
	}),
})

async function respond<T>(
	set: { status?: number | string },
	run: () => Promise<T>
) {
	try {
		return await run()
	} catch (error) {
		if (error instanceof CommissionError) {
			set.status = error.status
			return { error: error.code }
		}
		if (error instanceof ZodError) {
			set.status = 400
			return { error: 'INVALID_INPUT' }
		}
		console.error(
			'[admin:disputes]',
			(error as { code?: string })?.code ?? 'UNEXPECTED_ERROR'
		)
		set.status = 500
		return { error: 'COMMISSION_ERROR' }
	}
}

export const disputesRoutes = createElysia().group('/disputes', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			{
				beforeHandle: [requireAuth, requireDisputeAdmin],
				query: t.Object({
					take: t.Optional(t.Numeric()),
					page: t.Optional(t.Numeric()),
					status: t.Optional(
						t.Union([t.Literal('OPEN'), t.Literal('RESOLVED')])
					),
					kind: t.Optional(
						t.Union([t.Literal('ORDER'), t.Literal('REVIEW')])
					),
					assigned: t.Optional(
						t.Union([
							t.Literal('all'),
							t.Literal('unassigned'),
							t.Literal('me'),
						])
					),
					search: t.Optional(t.String({ maxLength: 100 })),
				}),
				detail: {
					tags: ['Admin'],
					summary: 'List commission disputes',
				},
			},
			({ query, store, set }) => {
				const take = Math.min(Math.max(query.take ?? 24, 1), 100)
				const page = Math.max((query.page ?? 1) - 1, 0)
				return respond(set, () =>
					listDisputes({
						take,
						page,
						status: query.status,
						kind: query.kind,
						assigned: query.assigned,
						search: query.search,
						actor: fromStore(store).user_id,
					})
				)
			}
		)
		.get(
			'/stats',
			{
				beforeHandle: [requireAuth, requireDisputeAdmin],
				detail: { tags: ['Admin'], summary: 'Dispute counters' },
			},
			({ store, set }) =>
				respond(set, () => disputeStats(fromStore(store).user_id))
		)
		.get(
			'/:id',
			{
				beforeHandle: [requireAuth, requireDisputeAdmin],
				params,
				detail: { tags: ['Admin'], summary: 'Dispute details' },
			},
			({ params, set }) => respond(set, () => getDispute(params.id))
		)
		.get(
			'/:id/messages',
			{
				beforeHandle: [requireAuth, requireDisputeAdmin],
				params,
				query: t.Object({
					after: t.Optional(t.Numeric({ minimum: 0 })),
					before: t.Optional(t.Numeric({ minimum: 0 })),
				}),
				detail: { tags: ['Admin'], summary: 'Dispute order messages' },
			},
			({ params, query, set }) =>
				respond(set, () =>
					disputeMessages(
						params.id,
						query.after ?? 0,
						query.before ?? 0
					)
				)
		)
		.get(
			'/:id/files/:fileId',
			{
				beforeHandle: [requireAuth, requireDisputeAdmin],
				params: fileParams,
				detail: { tags: ['Admin'], summary: 'Download dispute file' },
			},
			({ params, set }) =>
				respond(set, () => disputeFile(params.id, params.fileId))
		)
		.post(
			'/:id/actions',
			{
				beforeHandle: [requireAuth, requireDisputeAdmin],
				params,
				body: t.Unknown(),
				detail: { tags: ['Admin'], summary: 'Manage a dispute' },
			},
			({ params, body, store, set }) =>
				respond(set, () =>
					arbitration.command(
						fromStore(store).user_id,
						params.id,
						caseCommandSchema.parse(body),
						true
					)
				)
		)
)
