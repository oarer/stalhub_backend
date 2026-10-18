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
		.get('/diffs', {
				query: t.Object({
					refresh: t.Optional(t.BooleanString()),
				}),
				detail: { tags: ['Balance'] },
			}, async ({ query }) => {
				if (query.refresh) {
					await refreshBalanceDiffs(true)
				}
				const changes = await readBalanceDiffs()

				return {
					...toResponse(changes),
					status: getBalanceStatus(),
				}
			})
		.get('/diffs/archive', {
				detail: { tags: ['Balance'] },
			}, async () => {
				const files = listArchivedDiffs()
				return {
					total: files.length,
					files: files.map((file) => {
						const name = file.split('/').pop() ?? file
						return name.replace(/^diff_/, '').replace(/\.json$/, '')
					}),
				}
			})
		.get('/diffs/archive/:timestamp', {
				params: t.Object({ timestamp: t.String() }),
				detail: { tags: ['Balance'] },
			}, async ({ params }) => {
				const changes = readArchivedDiff(params.timestamp)
				if (!changes) {
					return {
						items: [],
						total: 0,
					}
				}
				return toResponse(changes)
			})
)
