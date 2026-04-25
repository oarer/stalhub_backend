import type { AxiosError } from 'axios'
import { t } from 'elysia'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { type LotsResponse, Regions } from '@/types/api.type'
import { createElysia } from '@/utils/elysia'

export const lotsRoute = createElysia()
	.get('/:region/:id/lots',
		async ({ params, query, set }) => {
			const { id, region } = params

			const limit = query.limit ?? '10'
			const additional = query.additional ?? 'true'

			try {
				const { data } = await apiClient.get<LotsResponse>(
					`/${region}/auction/${id}/lots`,
					{
						params: { limit, additional },
					}
				)

				return data
			} catch (err) {
				const error = err as AxiosError<{ message?: string }>
				const status = error.response?.status ?? 500
				const message =
					error.response?.data?.message ??
					error.message ??
					'Unknown error'

				set.status = status

				return { error: message }
			}
		},
		{
			params: t.Object({
				id: t.String(),
				region: t.Enum(Regions),
			}),
			query: t.Object({
				limit: t.Optional(t.String()),
				additional: t.Optional(t.String()),
			}),
			detail: {
				tags: ['Auction'],
			},
		}
	)
