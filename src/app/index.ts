import cors from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { createElysia } from '@/utils/elysia'
import { logger } from '@/utils/logger'
import { routes } from './api'

export const app = createElysia()
    .use(swagger())
    .use(cors())
    .use(logger)

    .use(routes)

export type App = typeof app
