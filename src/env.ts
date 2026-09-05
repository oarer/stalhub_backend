import { z } from 'zod'

const envVariables = z.object({
	PORT: z.coerce.number().default(3001),
	NODE_ENV: z.enum(['development', 'production']).default('development'),
	EXBO_TOKEN: z.string(),
	TOKEN: z.string(),
	LAUNCHER_SOURCES: z.string().min(1, 'LAUNCHER_SOURCES'),

	DISCORD_CLIENT_ID: z.string().default(''),
	DISCORD_CLIENT_SECRET: z.string().default(''),
	DISCORD_REDIRECT_URI: z.string().default(''),

	TELEGRAM_CLIENT_ID: z.string().default(''),
	TELEGRAM_CLIENT_SECRET: z.string().default(''),
	TELEGRAM_REDIRECT_URI: z.string().default(''),

	EXBO_CLIENT_ID: z.string().default(''),
	EXBO_CLIENT_SECRET: z.string().default(''),
	EXBO_REDIRECT_URI: z.string().default(''),
	ENCRYPT_KEY: z.string().default('dev'),

	JWT_SECRET: z.string().default('dev'),

	OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY'),
	OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
	OPENAI_MODEL: z.string().default('gpt-5-mini'),

	DISCORD_BOT_TOKEN: z.string().default(''),
	DISCORD_BOT_CLIENT_ID: z.string().default(''),
	DISCORD_BOT_SERVICE_JWT: z.string().default(''),

	SC_DB_LISTING_URL: z.string().default('https://cdn.stalhub.dev/db/listing'),
	SC_DB_LISTING_DIR: z.string().default('runtime/listing'),
	SC_DB_DIFFS_DIR: z.string().default('runtime/balance_diffs'),
})

export const env = envVariables.parse(process.env)
