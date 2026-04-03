import { createElysia } from '@/utils/elysia'
import { routeHealth } from './health'

export const routes = createElysia({ prefix: '/api' })
    .use(routeHealth)