import type { AxiosError } from 'axios'
import { t } from 'elysia'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { type LotsResponse, Regions } from '@/types/api.type'
import { createElysia } from '@/utils/elysia'

export const playerRoute = createElysia()
    .get('/player/:region/:character/profile',
        async ({ params, set }) => {
            const { region, character } = params

            try {
                const { data } = await apiClient.get<LotsResponse>(
                    `/${region}/character/by-name/${character}/profile`,
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
                character: t.String(),
                region: t.Enum(Regions),
            }),
        }
    )
