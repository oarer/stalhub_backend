import { z } from 'zod'

const envVariables = z.object({
	PORT: z.coerce.number().default(3001),
	NODE_ENV: z.enum(['development', 'production']).default('development'),
	EXBO_TOKEN: z.string().default(''),
	SC_GATEWAY_DIRECT_FALLBACK: z
		.string()
		.default('true')
		.transform((v) => v.toLowerCase() !== 'false' && v !== '0'),
	LAUNCHER_SOURCES: z.string().min(1, 'LAUNCHER_SOURCES'),
	LAUNCHER_AUTH_QUERY: z.string().min(1, 'LAUNCHER_AUTH_QUERY'),

	DISCORD_CLIENT_ID: z.string().default(''),
	DISCORD_CLIENT_SECRET: z.string().default(''),
	DISCORD_REDIRECT_URI: z.string().default(''),
	DESKTOP_REDIRECT_URI: z.string().default('stalhub://auth/callback'),
	DESKTOP_AUTH_TTL_SECONDS: z.coerce
		.number()
		.int()
		.min(30)
		.max(600)
		.default(120),
	WEB_ORIGIN: z.string().default('https://stalhub.dev'),

	TELEGRAM_CLIENT_ID: z.string().default(''),
	TELEGRAM_CLIENT_SECRET: z.string().default(''),
	TELEGRAM_REDIRECT_URI: z.string().default(''),

	EXBO_CLIENT_ID: z.string().default(''),
	EXBO_CLIENT_SECRET: z.string().default(''),
	EXBO_REDIRECT_URI: z.string().default(''),
	ENCRYPT_KEY: z.string().default('dev'),

	DESKTOP_AUTH_ORIGIN: z.string().default('https://api.stalhub.dev'),

	JWT_SECRET: z.string().default('dev'),

	OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY'),
	OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
	OPENAI_MODEL: z.string().default('gpt-5-mini'),

	DISCORD_BOT_TOKEN: z.string().default(''),
	DISCORD_BOT_CLIENT_ID: z.string().default(''),
	DISCORD_BOT_SERVICE_JWT: z.string().default(''),

	TG_BOT_TOKEN: z.string().default(''),
	TG_CHAT_ID: z.string().default(''),
	BLOG_DISCORD_WEBHOOK_URL: z.string().default(''),
	BLOG_PUBLIC_BASE_URL: z.string().default('https://stalhub.dev'),
	BLOG_OG_BASE_URL: z.string().default(''),

	SC_DB_LISTING_URL: z.string().default('https://cdn.stalhub.dev/db/listing'),
	SC_DB_LISTING_DIR: z.string().default('runtime/listing'),
	SC_DB_DIFFS_DIR: z.string().default('runtime/balance_diffs'),

	AUCTION_DATABASE_URL: z.string().default(''),
	AUCTION_SWEEP_CRON: z.string().default('*/5 * * * *'),
	AUCTION_ROLLUP_CRON: z.string().default('15 3 * * *'),
	AUCTION_SWEEP_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
	AUCTION_SWEEP_DELAY_MS: z.coerce.number().int().min(0).max(60000).default(250),
	AUCTION_SWEEP_MAX_PAGES: z.coerce.number().int().min(1).max(200).default(10),
	AUCTION_BACKFILL_CAP: z.coerce.number().int().min(200).max(50000).default(5000),
	AUCTION_BACKFILL_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
	AUCTION_BACKFILL_DELAY_MS: z.coerce.number().int().min(0).max(60000).default(500),

	AUCTION_DEEPEN_CAP: z.coerce.number().int().min(1000).max(25000000).default(100000),
	AUCTION_DEEPEN_MAX_AGE_DAYS: z.coerce.number().int().min(7).max(3650).default(90),
	AUCTION_DEEPEN_TOP: z.coerce.number().int().min(1).max(500).default(50),
	AUCTION_DEEPEN_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
	AUCTION_DEEPEN_DELAY_MS: z.coerce.number().int().min(0).max(60000).default(400),
	AUCTION_QUOTA_BACKOFF_MS: z.coerce.number().int().min(1000).max(600000).default(60000),

	LOOT_KEY: z.string().default('dev'),
	LOOT_SOURCE_DIR: z.string().default(''),
	LOOT_SHUFFLEBAGS_DIR: z.string().default(''),
	LOOT_ITEMS_DIRS: z.string().default(''),
	LOOT_LANG_DIR: z.string().default(''),
	LOOT_OUT_DIR: z.string().default('runtime/loot'),

	// auto-ban
	LOGIN_MAX_FAILURES: z.coerce.number().default(999),
	RPS_THRESHOLD: z.coerce.number().default(999),
	IP_BLOCK_MIN_SECONDS: z.coerce.number().default(60 * 60),
	IP_BLOCK_MAX_SECONDS: z.coerce.number().default(48 * 60 * 60),
	AUTO_BAN_SKIP_RANK: z.coerce.number().default(0),
	ADMIN_ALERT_WEBHOOK: z.string().default(''),

	IMAGE_SERVICE_URL: z.string().default('http://localhost:3002'),
	IMAGE_SERVICE_TIMEOUT_MS: z.coerce
		.number()
		.int()
		.min(1000)
		.max(120000)
		.default(15000),


	S3_UPLOADS_ENABLED: z
		.string()
		.default('false')
		.transform((v) => v.toLowerCase() !== 'false' && v !== '0'),
	S3_ENDPOINT: z.string().default('https://s3.ru1.storage.beget.cloud'),
	S3_REGION: z.string().default('ru-1'),
	S3_UPLOADS_BUCKET: z.string().default(''),
	S3_ACCESS_KEY_ID: z.string().default(''),
	S3_SECRET_ACCESS_KEY: z.string().default(''),
	S3_PUBLIC_BASE_URL: z.string().default(''),

	FORUM_COOKIE: z.string().default(''),
	FORUM_USER_AGENT: z
		.string()
		.default(
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0'
		),
})

export const env = envVariables.parse(process.env)
