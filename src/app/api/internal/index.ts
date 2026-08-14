import { t } from 'elysia'
import { env } from '@/env'
import { createElysia } from '@/utils/elysia'

export const internalRoutes = createElysia().group('/internal', (app) =>
	app.post(
		'/bot/notify',
		async ({ body, headers, set }) => {
			const auth =
				(headers as Record<string, string | undefined>)[
					'x-bot-secret'
				] ?? ''
			if (
				!env.DISCORD_BOT_SERVICE_JWT ||
				auth !== env.DISCORD_BOT_SERVICE_JWT
			) {
				set.status = 401
				return { error: 'Invalid bot secret' }
			}
			return { ok: true, payload: body }
		},
		{
			body: t.Object({ channel_id: t.String(), message: t.String() }),
			detail: { tags: ['Internal'] },
		}
	)
)
