import cors from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { createElysia } from '@/utils/elysia'

import { logger } from '@/utils/logger'
import { routes } from './app'
import { env } from './env'

export const app = createElysia()
  .use(swagger())
  .use(cors())
  .use(logger)
  .use(routes)

  .listen({ port: env.PORT }, ({ hostname, port }) => {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
    console.log(
      `StalHub backend started on: ${protocol}://${hostname}:${port}`
    )
  })

export type App = typeof app
