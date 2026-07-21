import { t } from 'elysia'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { prisma } from '@/lib/prisma'
import type { PlayerResponse, Stat } from '@/types/player.type'
import { fromStore, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import * as cache from './cache'

const ALLOWED_STAT_IDS = new Set([
	'reg-tim',
	'pla-tim',
	'bul-dea',
	'kil',
	'max-kil-ser',
	'sho-hit',
	'sho-fir',
	'sho-hea',
])

function decodeTokenBlob(tokenBlob: string) {
	return JSON.parse(Buffer.from(tokenBlob, 'base64').toString('utf-8')) as {
		access_token: string
		refresh_token?: string
	}
}

interface CharacterInformation {
	id: string
	name: string
	creationTime: string
}

interface ClanInfo {
	id: string
	name: string
	level: number
	registrationTime: string
	alliance: string
	description: string
	leader: string
}

interface ClanMember {
	name: string
	rank: string
	joinTime: string
}

interface Clan {
	info: ClanInfo
	member: ClanMember
}

interface CharacterEntry {
	information: CharacterInformation
	clan: Clan
}

function filterPlayerResponse(raw: PlayerResponse): PlayerResponse {
	return {
		...raw,
		displayedAchievements: [],
		stats: raw.stats.filter((s: Stat) => ALLOWED_STAT_IDS.has(s.id)),
	}
}

export const exboRoutes = createElysia().group('/exbo', (app) =>
	app
		.use(jwtPlugin)
		.get(
		'/:region/characters',
		async ({ params, store, set }) => {
			const { userId } = fromStore(store)

			const auth = await prisma.eXBOAuth.findUnique({
				where: { userid: userId },
			})

			if (!auth) {
				set.status = 404
				return { error: 'EXBO account not linked' }
			}

			const { access_token } = decodeTokenBlob(auth.token_blob)

			const charactersRes = await apiClient.get<CharacterEntry[]>(
				`/${params.region}/characters`,
				{
					headers: {
						Authorization: `Bearer ${access_token}`,
					},
					_skipAuth: true,
				} as never
			)

			const profiles: PlayerResponse[] = []

			for (const char of charactersRes.data) {
				const cached = await cache.getProfile(
					params.region,
					char.information.name
				)
				if (cached) {
					profiles.push(cached)
					continue
				}

				try {
					const { data: raw } = await apiClient.get<PlayerResponse>(
						`/${params.region}/character/by-name/${char.information.name}/profile`,
						{
							headers: {
								Authorization: `Bearer ${access_token}`,
							},
							_skipAuth: true,
						} as never
					)

					const filtered = filterPlayerResponse(raw)
					await cache.setProfile(params.region, char.information.name, filtered)
					profiles.push(filtered)
				} catch {
					profiles.push({
						username: char.information.name,
						uuid: char.information.id,
						status: 'error',
						alliance: null as never,
						lastLogin: null as never,
						displayedAchievements: [],
						clan: null as never,
						stats: [],
					})
				}
			}

			return profiles
		},
		{
			beforeHandle: [requireAuth],
			params: t.Object({
				region: t.String({ error: 'region is required' }),
			}),
			detail: { tags: ['EXBO'] },
		}
	)
)
