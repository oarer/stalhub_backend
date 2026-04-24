
import { createElysia } from '@/utils/elysia'
import { api } from './api'

export const routes = createElysia({ prefix: '/api' })
    .use(api)

    .get(
        '/',
        () =>
            `Hi!\nThis API was created for https://stalhub.tech <3\n\nBy: https://github.com/oarer`
    )