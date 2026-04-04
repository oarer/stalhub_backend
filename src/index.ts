import { app } from './app'
import { env } from './env'
import { createElysia } from './utils/elysia'

const server = createElysia()
  // Routes
  .use(app)
  
  .get(
    "/",
    () =>
      `Hi!\nThis API was created for https://stalhub.tech\n\nBy: https://github.com/oarer`
  )

server.listen({ port: env.PORT }, ({ hostname, port }) => {
  const url = env.NODE_ENV === 'production' ? 'https' : 'http'

  console.log(`StalHub backend started on: ${url}://${hostname}:${port}`)
})