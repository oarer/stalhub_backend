import { t } from 'elysia'
import { prisma } from '@/lib/prisma'
import { createElysia } from '@/utils/elysia'

const DISCORD_CDN = 'https://cdn.discordapp.com'

type AvatarProvider = 'discord' | 'telegram'

function buildDiscordUrl(discordId: string, avatarId: string) {
	const ext = avatarId.startsWith('a_') ? 'gif' : 'png'

	return `${DISCORD_CDN}/avatars/${discordId}/${avatarId}.${ext}?size=1024`
}

function escapeXml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
}

function buildFallbackAvatar(username: string) {
	const letter = escapeXml(username.trim().charAt(0).toUpperCase() || '?')

	const svg = `
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 104 104"
		>
			<rect
				width="104"
				height="104"
				rx="52"
				fill="#27272a"
			/>

			<text
				x="52"
				y="52"
				text-anchor="middle"
				dominant-baseline="central"
				fill="#a1a1aa"
				font-family="Arial, sans-serif"
				font-size="44"
				font-weight="700"
			>
				${letter}
			</text>
		</svg>
	`.trim()

	return new Response(svg, {
		status: 200,
		headers: {
			'Content-Type': 'image/svg+xml',
			'Cache-Control': 'public, max-age=86400, s-maxage=86400',
		},
	})
}

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

	return new Response(res.body, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=86400, s-maxage=86400',
		},
	})
}

function getAvatarUrl(
	user: {
		DiscordAuth: {
			discord_id: string
			avatar_id: string | null
		} | null
		TelegramAuth: {
			avatar_id: string | null
		} | null
	},
	provider?: AvatarProvider
) {
	if (provider === 'discord') {
		const discordAuth = user.DiscordAuth

		if (!discordAuth?.avatar_id) {
			return null
		}

		return buildDiscordUrl(discordAuth.discord_id, discordAuth.avatar_id)
	}

	if (provider === 'telegram') {
		const telegramAuth = user.TelegramAuth

		if (!telegramAuth?.avatar_id) {
			return null
		}

		return telegramAuth.avatar_id
	}

	if (user.DiscordAuth?.avatar_id) {
		return buildDiscordUrl(
			user.DiscordAuth.discord_id,
			user.DiscordAuth.avatar_id
		)
	}

	if (user.TelegramAuth?.avatar_id) {
		return user.TelegramAuth.avatar_id
	}

	return null
}

export const avatarRoutes = createElysia().get(
	'/avatar/:id',
	async ({ params, query }) => {
		const user = await prisma.user.findUnique({
			where: {
				id: Number(params.id),
			},
			select: {
				username: true,

				DiscordAuth: {
					select: {
						discord_id: true,
						avatar_id: true,
					},
				},

				TelegramAuth: {
					select: {
						avatar_id: true,
					},
				},
			},
		})

		if (!user) {
			return new Response(
				JSON.stringify({
					error: 'User not found',
				}),
				{
					status: 404,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			)
		}

		const avatarUrl = getAvatarUrl(user, query.provider)

		if (!avatarUrl) {
			return buildFallbackAvatar(user.username)
		}

		return proxyImage(avatarUrl)
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
