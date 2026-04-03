import cors from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { logger } from '@/utils/logger'
import { createElysia } from '../utils/elysia'
import { routes } from './api'

export const app = createElysia()
    .use(swagger())

    .use(cors())
    .use(logger)

    .use(routes)

export type App = typeof app
