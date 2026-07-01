import { z } from 'zod'

const envVariables = z.object({
	PORT: z.coerce.number().default(3001),
	NODE_ENV: z
		.enum(['development', 'production'])
		.default('development'),
	EXBO_TOKEN: z.string(),
	TOKEN: z.string(),

	DISCORD_CLIENT_ID: z.string().default(''),
	DISCORD_CLIENT_SECRET: z.string().default(''),
	DISCORD_REDIRECT_URI: z.string().default(''),

	TELEGRAM_CLIENT_ID: z.string().default(''),
	TELEGRAM_CLIENT_SECRET: z.string().default(''),
	TELEGRAM_REDIRECT_URI: z.string().default(''),

	EXBO_CLIENT_ID: z.string().default(''),
	EXBO_CLIENT_SECRET: z.string().default(''),
	EXBO_REDIRECT_URI: z.string().default(''),

	JWT_SECRET: z.string().default('dev'),
})

export const env = envVariables.parse(process.env)
