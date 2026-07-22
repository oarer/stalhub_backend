import { t } from 'elysia'
import { prisma } from '@/lib/prisma'
import { createElysia } from '@/utils/elysia'

const DISCORD_CDN = 'https://cdn.discordapp.com'

async function proxyImage(url: string) {
	const res = await fetch(url)

	if (!res.ok) {
		return new Response(
			JSON.stringify({
				error: 'Failed to fetch avatar',
			}),
			{
				status: 502,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		)
	}

	const contentType = res.headers.get('content-type') ?? 'image/png'

	const body = await res.arrayBuffer()

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=86400, s-maxage=86400',
		},
	})
}

function buildDiscordUrl(discordId: string, avatarId: string) {
	const ext = avatarId.startsWith('a_') ? 'gif' : 'png'

	return `${DISCORD_CDN}/avatars/${discordId}/${avatarId}.${ext}?size=1024`
}

export const avatarRoutes = createElysia().get(
	'/avatar/:id',
	async ({ params, query, set }) => {
		const user = await prisma.user.findUnique({
			where: {
				id: Number(params.id),
			},
			include: {
				DiscordAuth: true,
				TelegramAuth: true,
			},
		})

		if (!user) {
			set.status = 404

			return {
				error: 'User not found',
			}
		}

		const provider = query.provider

		if (provider === 'discord') {
			const discordAuth = user.DiscordAuth

			if (!discordAuth?.avatar_id) {
				set.status = 404

				return {
					error: 'Discord avatar not found',
				}
			}

			return proxyImage(
				buildDiscordUrl(discordAuth.discord_id, discordAuth.avatar_id)
			)
		}

		if (provider === 'telegram') {
			const telegramAuth = user.TelegramAuth

			if (!telegramAuth?.avatar_id) {
				set.status = 404

				return {
					error: 'Telegram avatar not found',
				}
			}

			return proxyImage(telegramAuth.avatar_id)
		}

		if (user.DiscordAuth?.avatar_id) {
			return proxyImage(
				buildDiscordUrl(
					user.DiscordAuth.discord_id,
					user.DiscordAuth.avatar_id
				)
			)
		}

		if (user.TelegramAuth?.avatar_id) {
			return proxyImage(user.TelegramAuth.avatar_id)
		}

		set.status = 404

		return {
			error: 'Avatar not found',
		}
	},
	{
		params: t.Object({
			id: t.String(),
		}),

		query: t.Object({
			provider: t.Optional(
				t.Union([t.Literal('discord'), t.Literal('telegram')])
			),
		}),

		detail: {
			tags: ['Users'],
		},
	}
)
