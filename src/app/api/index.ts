import { createElysia } from '@/utils/elysia'
import { routeArsenal } from './arsenal'
import { routeHealth } from './health'

export const routes = createElysia({ prefix: '/api' })
    .use(routeHealth)
    .use(routeArsenal)
