import { t } from 'elysia'
import { createElysia } from '@/utils/elysia'
import { listArchivedDiffs, readArchivedDiff } from './diffs'
import {
	getBalanceStatus,
	readBalanceDiffs,
	refreshBalanceDiffs,
} from './service'
import type { Changes } from './types'

const toResponse = (changes: Changes | null) => ({
	items: changes ?? [],
	total: (changes ?? []).length,
})

export const balanceRoutes = createElysia().group('/balance', (app) =>
	app
		.get(
			'/diffs',
			async ({ query }) => {
				if (query.refresh) {
					await refreshBalanceDiffs(true)
				}
				const changes = await readBalanceDiffs()

				return {
					...toResponse(changes),
					status: getBalanceStatus(),
				}
			},
			{
				query: t.Object({
					refresh: t.Optional(t.BooleanString()),
				}),
				detail: { tags: ['Balance'] },
			}
		)
		.get(
			'/diffs/archive',
			async () => {
				const files = listArchivedDiffs()
				return {
					total: files.length,
					files: files.map((file) => {
						const name = file.split('/').pop() ?? file
						return name.replace(/^diff_/, '').replace(/\.json$/, '')
					}),
				}
			},
			{
				detail: { tags: ['Balance'] },
			}
		)
		.get(
			'/diffs/archive/:timestamp',
			async ({ params }) => {
				const changes = readArchivedDiff(params.timestamp)
				if (!changes) {
					return {
						items: [],
						total: 0,
					}
				}
				return toResponse(changes)
			},
			{
				params: t.Object({ timestamp: t.String() }),
				detail: { tags: ['Balance'] },
			}
		)
)
