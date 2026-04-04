import { cron } from '@elysiajs/cron'
import items from '@/data/arsenal.json'
import type { ItemInput, ItemResult } from '@/types/arsenal.type'
import { createElysia } from '@/utils/elysia'
import {
    getCache,
    shouldRevalidate,
} from './cache'
import { updatePrices } from './utils'

export const routeArsenal = createElysia()
    .use(
        cron({
            name: 'arsenal-update',
            pattern: '0 0,12 * * *',
            timezone: 'Europe/Moscow',
            run: updatePrices,
        })
    )
    .onStart(async () => {
        const cached = await getCache()
        if (!cached || shouldRevalidate(cached.updatedAt)) {
            await updatePrices()
        }
    })
    .get('/arsenal', async () => {
        const cached = await getCache()

        if (!cached) {
            await updatePrices()
            const fresh = await getCache()

            return {
                status: 'ok',
                updatedAt: fresh?.updatedAt,
                total: fresh?.items.length ?? 0,
                items: fresh?.items ?? [],
            }
        }

        if (shouldRevalidate(cached.updatedAt)) {
            updatePrices()
        }

        return {
            status: 'ok',
            updatedAt: cached.updatedAt,
            total: cached.items.length,
            items: cached.items,
        }
    })
