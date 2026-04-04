import { z } from 'zod'

const envVariables = z.object({
    PORT: z.coerce.number().default(3001),
    RUNTIME: z.enum(['bun', 'edge']).default('bun'),
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
    EXBO_TOKEN: z.string()
})

export const env = envVariables.parse(process.env)