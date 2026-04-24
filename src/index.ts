import { app } from './app'
import { env } from './env'
import { createElysia } from './utils/elysia'

export const server = createElysia()
  .use(app)

  .get(
    "/",
    () =>
      `Hi!\nThis API was created for https://stalhub.tech <3\n\nBy: https://github.com/oarer`
  )
  .listen({ port: env.PORT }, ({ hostname, port }) => {
    const url = env.NODE_ENV === 'production' ? 'https' : 'http'

    console.log(`StalHub backend started on: ${url}://${hostname}:${port}`)
  })
