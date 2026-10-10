import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { analyticsService } from '@/app/api/clan/services/analytics'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { deleteUpload, putUpload } from '@/lib/uploads'
import type { PlayerResponse } from '@/types/player.type'
import { decryptSecretJson, encryptSecret } from '@/utils/crypto'

interface ExboCharacterEntry {
	information: { id: string; name: string }
}

async function getUserAccessToken(user_id: number): Promise<string> {
	const auth = await prisma.eXBOAuth.findUnique({
		where: { userid: user_id },
	})
	if (!auth) throw new Error('EXBO account not linked')

	const blob = decryptSecretJson<{
		access_token: string
		refresh_token?: string
	}>(auth.token_blob)

	const now = new Date()
	if (auth.access_expires_at > now && blob.access_token) {
		return blob.access_token
	}

	// try refresh
	if (
		blob.refresh_token &&
		(!auth.refresh_expires_at || auth.refresh_expires_at > now)
	) {
		const body = new URLSearchParams({
			client_id: env.EXBO_CLIENT_ID,
			client_secret: env.EXBO_CLIENT_SECRET,
			refresh_token: blob.refresh_token,
			grant_type: 'refresh_token',
		})
		const res = await fetch('https://exbo.net/oauth/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		})
		if (!res.ok) throw new Error('EXBO token expired, relink account')
		const data = (await res.json()) as {
			access_token: string
			refresh_token?: string
			expires_in: number
			refresh_expires_in?: number
		}
		await prisma.eXBOAuth.update({
			where: { id: auth.id },
			data: {
				token_blob: encryptSecret(
					JSON.stringify({
						access_token: data.access_token,
						refresh_token: data.refresh_token ?? blob.refresh_token,
					})
				),
				access_expires_at: new Date(Date.now() + data.expires_in * 1000),
				...(data.refresh_expires_in
					? {
							refresh_expires_at: new Date(
								Date.now() + data.refresh_expires_in * 1000
							),
						}
					: {}),
			},
		})
		return data.access_token
	}

	if (blob.access_token) return blob.access_token
	throw new Error('EXBO token expired, relink account')
}

async function fetchOwnedCharacters(
	region: string,
	token: string
): Promise<ExboCharacterEntry[]> {
	const { data } = await apiClient.get<ExboCharacterEntry[]>(
		`/${region}/characters`,
		{
			headers: { Authorization: `Bearer ${token}` },
			_skipAuth: true,
		} as never
	)
	return data ?? []
}

async function fetchCharacterProfile(
	region: string,
	character: string,
	token: string
): Promise<PlayerResponse> {
	const { data } = await apiClient.get<PlayerResponse>(
		`/${region}/character/by-name/${character}/profile`,
		{
			headers: { Authorization: `Bearer ${token}` },
			_skipAuth: true,
		} as never
	)
	if (!data || !data.uuid) throw new Error('Character profile not found')
	return data
}

class PersonalService {
	async getMy(user_id: number) {
		return prisma.personalProfile.findUnique({ where: { user_id } })
	}

	async link(user_id: number, region: string, character: string) {
		const token = await getUserAccessToken(user_id)
		const owned = await fetchOwnedCharacters(region, token)
		const match = owned.find(
			(c) => c.information?.name?.toLowerCase() === character.toLowerCase()
		)
		if (!match) throw new Error('Character does not belong to this EXBO account')

		const prev = await prisma.personalProfile.findUnique({
			where: { user_id },
		})
		if (
			prev &&
			(prev.character_name.toLowerCase() !==
				match.information.name.toLowerCase() ||
				prev.region !== region)
		) {
			// другой персонаж — старые слепки статистики больше не валидны
			await prisma.personalSnapshot.deleteMany({ where: { user_id } })
		}

		const profile = await prisma.personalProfile.upsert({
			where: { user_id },
			create: {
				user_id,
				region,
				character_name: match.information.name,
				character_uuid: match.information.id,
			},
			update: {
				region,
				character_name: match.information.name,
				character_uuid: match.information.id,
			},
		})

		// immediate snapshot, ignore errors (token/rate issues shouldn't block link)
		try {
			await this.takeSnapshot(user_id)
		} catch {}

		return profile
	}

	async unlink(user_id: number) {
		// личные сессии этапов + файлы скриншотов
		const sessions = await prisma.stageSession.findMany({
			where: { creator_id: user_id, clan_id: null },
			select: { screenshots: { select: { file_path: true } } },
		})
		for (const s of sessions) {
			for (const shot of s.screenshots) {
				await deleteUpload(shot.file_path)
			}
		}
		await prisma.stageSession.deleteMany({
			where: { creator_id: user_id, clan_id: null },
		})
		// слепки статистики старого персонажа
		await prisma.personalSnapshot.deleteMany({ where: { user_id } })
		await prisma.personalProfile.deleteMany({ where: { user_id } })
		return { success: true }
	}

	async setVisibility(
		user_id: number,
		is_public: boolean,
		public_fields?: string[]
	) {
		const existing = await prisma.personalProfile.findUnique({
			where: { user_id },
		})
		if (!existing) throw new Error('No tracked character')
		return prisma.personalProfile.update({
			where: { user_id },
			data: {
				is_public,
				...(public_fields ? { public_fields } : {}),
			},
		})
	}

	async takeSnapshot(user_id: number) {
		const profile = await prisma.personalProfile.findUnique({
			where: { user_id },
		})
		if (!profile) throw new Error('No tracked character')

		const token = await getUserAccessToken(user_id)
		const data = await fetchCharacterProfile(
			profile.region,
			profile.character_name,
			token
		)

		const snapshot = await prisma.personalSnapshot.create({
			data: {
				user_id,
				region: profile.region,
				character_name: data.username ?? profile.character_name,
				stats: (data.stats ?? []) as never,
				profile: {
					uuid: data.uuid,
					alliance: data.alliance,
					lastLogin: data.lastLogin,
					clan: data.clan
						? {
								id: data.clan.info?.id,
								name: data.clan.info?.name,
								tag: data.clan.info?.tag,
							}
						: null,
				} as never,
			},
		})

		await prisma.personalProfile.update({
			where: { user_id },
			data: {
				last_snapshot_at: new Date(),
				character_uuid: data.uuid ?? profile.character_uuid,
				character_name: data.username ?? profile.character_name,
			},
		})

		return snapshot
	}

	async snapshotAll() {
		const profiles = await prisma.personalProfile.findMany({
			select: { user_id: true },
		})
		let ok = 0
		for (const p of profiles) {
			try {
				await this.takeSnapshot(p.user_id)
				ok++
			} catch (err) {
				console.warn(`[Personal] snapshot failed for user ${p.user_id}:`, err)
			}
		}
		console.log(`[Personal] snapshots: ${ok}/${profiles.length}`)
		return { total: profiles.length, ok }
	}

	async getSnapshots(
		user_id: number,
		opts: { from?: string; to?: string; limit?: number } = {}
	) {
		const limit = Math.min(opts.limit ?? 500, 2000)
		return prisma.personalSnapshot.findMany({
			where: {
				user_id,
				...(opts.from || opts.to
					? {
							created_at: {
								...(opts.from ? { gte: new Date(opts.from) } : {}),
								...(opts.to ? { lte: new Date(opts.to) } : {}),
							},
						}
					: {}),
			},
			orderBy: { created_at: 'asc' },
			take: limit,
		})
	}

	async getSummary(user_id: number) {
		const snapshots = await this.getSnapshots(user_id, { limit: 500 })
		if (snapshots.length === 0) {
			return { snapshots: 0, series: {}, deltas: {}, first: null, last: null }
		}
		const series: Record<string, { t: string; v: number | string }[]> = {}
		for (const s of snapshots) {
			const stats = (s.stats ?? []) as { id: string; value: number | string }[]
			for (const st of stats) {
				if (typeof st.value !== 'number') continue
				;(series[st.id] ??= []).push({
					t: s.created_at.toISOString(),
					v: Number(st.value),
				})
			}
		}
		const deltas: Record<string, number> = {}
		for (const [id, points] of Object.entries(series)) {
			if (points.length >= 2) {
				deltas[id] =
					Number(points[points.length - 1]!.v) - Number(points[0]!.v)
			}
		}
		return {
			snapshots: snapshots.length,
			series,
			deltas,
			first: snapshots[0],
			last: snapshots[snapshots.length - 1],
		}
	}

	async getPublic(usernameOrCharacter: string) {
		const key = usernameOrCharacter.trim()
		let user = await prisma.user.findUnique({
			where: { username: key },
			select: { id: true, username: true, name: true },
		})
		// фронт строит ссылку по нику персонажа — поддерживаем оба варианта
		if (!user) {
			const profile = await prisma.personalProfile.findFirst({
				where: { character_name: { equals: key, mode: 'insensitive' } },
				select: { user_id: true },
			})
			if (profile) {
				user = await prisma.user.findUnique({
					where: { id: profile.user_id },
					select: { id: true, username: true, name: true },
				})
			}
		}
		if (!user) return null
		const profile = await prisma.personalProfile.findUnique({
			where: { user_id: user.id },
		})
		if (!profile || !profile.is_public) return null
		const snapshots = await this.getSnapshots(user.id, { limit: 500 })
		// публичная сводка по этапам: только агрегаты, без отдельных сессий
		const { per_stage: _omit, ...stageStats } = await this.stageStatsFor(
			user.id,
			profile.character_name
		)
		void _omit
		return {
			user: { username: user.username, name: user.name },
			profile: {
				region: profile.region,
				character_name: profile.character_name,
				public_fields: profile.public_fields,
				last_snapshot_at: profile.last_snapshot_at,
			},
			snapshots,
			stage_stats: stageStats,
		}
	}

	// ============ PERSONAL STAGE SESSIONS (этапы для персонажа) ============

	async createSession(
		user_id: number,
		input: {
			region: string
			map_name: string
			type?: string
			stage_number?: number | null
			started_at?: string
		}
	) {
		const profile = await prisma.personalProfile.findUnique({
			where: { user_id },
		})
		if (!profile) throw new Error('No tracked character')
		return analyticsService.createSession({
			creator_id: user_id,
			region: input.region || profile.region,
			map_name: input.map_name,
			type: input.type,
			stage_number: input.stage_number ?? null,
			started_at: input.started_at,
		})
	}

	async listSessions(user_id: number) {
		return analyticsService.listSessions(user_id)
	}

	async getSession(user_id: number, id: number) {
		const session = await prisma.stageSession.findUnique({
			where: { id },
		})
		if (!session || session.clan_id) throw new Error('Session not found')
		if (session.creator_id !== user_id) throw new Error('Not your session')
		return analyticsService.getSession(id)
	}

	async addScreenshot(
		user_id: number,
		session_id: number,
		file: { name: string; type: string; buffer: Buffer }
	) {
		const session = await prisma.stageSession.findFirst({
			where: { id: session_id, creator_id: user_id, clan_id: null },
			select: { id: true },
		})
		if (!session) throw new Error('Session not found')
		const existing = await prisma.stageScreenshot.count({
			where: { session_id },
		})
		if (existing > 0) {
			throw new Error('Only one screenshot per stage is allowed')
		}
		const ext = path.extname(file.name) || '.png'
		const filename = `${session_id}-personal-${randomUUID()}${ext}`
		const relativePath = path.join('uploads', 'screenshots', filename)
		await putUpload(`/${relativePath}`, file.buffer, file.type || 'image/png')
		const row = await prisma.stageScreenshot.create({
			data: {
				session_id,
				file_path: relativePath,
				mime_type: file.type,
				size_bytes: file.buffer.length,
			},
		})
		void analyticsService.runAnalysis(row.id, relativePath)
		return row
	}

	async retryAnalysis(user_id: number, screenshot_id: number) {
		const shot = await prisma.stageScreenshot.findUnique({
			where: { id: screenshot_id },
			include: { session: { select: { clan_id: true, creator_id: true } } },
		})
		if (
			!shot ||
			shot.session.clan_id ||
			shot.session.creator_id !== user_id
		) {
			throw new Error('Screenshot not found')
		}
		if (shot.ai_status === 'processing') return shot
		await analyticsService.runAnalysis(screenshot_id, shot.file_path)
		return prisma.stageScreenshot.findUnique({
			where: { id: screenshot_id },
		})
	}

	async deleteSession(user_id: number, session_id: number) {
		const session = await prisma.stageSession.findUnique({
			where: { id: session_id },
			include: { screenshots: { select: { file_path: true } } },
		})
		if (!session || session.clan_id || session.creator_id !== user_id) {
			throw new Error('Session not found')
		}
		for (const shot of session.screenshots) {
			await deleteUpload(shot.file_path)
		}
		const { deleteSessionWithRating } = await import(
			'@/app/api/clan/services/rating'
		)
		return deleteSessionWithRating(session_id)
	}

	async getMyStageStats(user_id: number) {
		const profile = await prisma.personalProfile.findUnique({
			where: { user_id },
		})
		if (!profile) {
			return {
				sessions: 0,
				appearances: 0,
				kills: 0,
				deaths: 0,
				assists: 0,
				kd: 0,
				kda: 0,
				per_clan: [],
				per_stage: [],
				per_map: [],
			}
		}
		return this.stageStatsFor(user_id, profile.character_name)
	}

	private async stageStatsFor(user_id: number, characterName: string) {
		const sessions = await prisma.stageSession.findMany({
			where: { creator_id: user_id, clan_id: null },
			orderBy: { started_at: 'desc' },
			take: 100,
			include: {
				clan: { select: { id: true, tag: true, name: true } },
				screenshots: {
					where: { ai_status: 'done' },
					select: { ai_result: true },
				},
			},
		})
		// клановые сессии, где светился юзер: посещаемость по user_id или нику.
		// is_public клана не важен — это личная сводка владельца статистики.
		const att = await prisma.stageAttendance.findMany({
			where: {
				session: { clan_id: { not: null } },
				OR: [
					{ user_id },
					{
						name: {
							equals: characterName,
							mode: 'insensitive',
						},
					},
				],
			},
			orderBy: { id: 'desc' },
			take: 500,
			select: { session_id: true },
		})
		const clanSessionIds = [...new Set(att.map((a) => a.session_id))]
		const seen = new Set(sessions.map((s) => s.id))
		const clanSessions =
			clanSessionIds.length > 0
				? (
						await prisma.stageSession.findMany({
							where: { id: { in: clanSessionIds } },
							include: {
								clan: { select: { id: true, tag: true, name: true } },
								screenshots: {
									where: { ai_status: 'done' },
									select: { ai_result: true },
								},
							},
						})
					).filter((s) => {
						if (seen.has(s.id)) return false
						seen.add(s.id)
						return true
					})
				: []
		const all = [...sessions, ...clanSessions]
		const name = characterName.toLowerCase()
		const byClan = new Map<
			string,
			{
				clan_id: string | null
				tag: string | null
				name: string | null
				sessions: Set<number>
				appearances: number
				kills: number
				deaths: number
				assists: number
			}
		>()
		const per_stage: {
			session_id: number
			map_name: string
			started_at: Date
			clan: string
			kills: number
			deaths: number
			assists: number
		}[] = []
		let appearances = 0
		let kills = 0
		let deaths = 0
		let assists = 0
		const played = new Set<number>()
		for (const s of all) {
			// клан сессии: реальный клан либо своя команда из сводки ИИ
			// (для ручных загрузок) — просто название клана, без «Личных»
			const summary = s.ai_summary as {
				teams?: { name?: string | null; is_player_clan?: boolean }[]
			} | null
			const aiTeam =
				summary?.teams?.find((tm) => tm.is_player_clan)?.name?.trim() ||
				null
			const key = s.clan?.id ?? (aiTeam ? `team:${aiTeam.toLowerCase()}` : 'personal')
			if (!byClan.has(key)) {
				byClan.set(key, {
					clan_id: s.clan?.id ?? null,
					tag: s.clan?.tag ?? null,
					name: s.clan?.name ?? aiTeam,
					sessions: new Set(),
					appearances: 0,
					kills: 0,
					deaths: 0,
					assists: 0,
				})
			}
			const bucket = byClan.get(key)!
			const clanLabel = s.clan
				? s.clan.tag
					? `[${s.clan.tag}] ${s.clan.name}`
					: s.clan.name
				: (aiTeam ?? 'personal')
			for (const shot of s.screenshots) {
				const r = shot.ai_result as {
					players?: {
						name: string
						kills?: number
						deaths?: number
						assists?: number
					}[]
				} | null
				const me = r?.players?.find(
					(p) => p.name.trim().toLowerCase() === name
				)
				if (me) {
					const k = me.kills ?? 0
					const d = me.deaths ?? 0
					const a = me.assists ?? 0
					appearances++
					kills += k
					deaths += d
					assists += a
					played.add(s.id)
					bucket.sessions.add(s.id)
					bucket.appearances++
					bucket.kills += k
					bucket.deaths += d
					bucket.assists += a
					per_stage.push({
						session_id: s.id,
						map_name: s.map_name,
						started_at: s.started_at,
						clan: clanLabel,
						kills: k,
						deaths: d,
						assists: a,
					})
				}
			}
		}
		const kdOf = (k: number, d: number) => (d > 0 ? k / d : k)
		const kdaOf = (k: number, d: number, a: number) =>
			(k + a) / Math.max(1, d)
		// склеиваем команды из ИИ с реальными кланами по имени/тегу
		const realBuckets = [...byClan.values()].filter((b) => b.clan_id)
		for (const [key, b] of [...byClan.entries()]) {
			if (b.clan_id || b.appearances === 0) continue
			const team = (b.name ?? '').toLowerCase()
			if (!team) continue
			const match = realBuckets.find(
				(r) =>
					r.name?.toLowerCase() === team || r.tag?.toLowerCase() === team
			)
			if (!match) continue
			for (const sid of b.sessions) match.sessions.add(sid)
			match.appearances += b.appearances
			match.kills += b.kills
			match.deaths += b.deaths
			match.assists += b.assists
			byClan.delete(key)
		}
		const per_clan = [...byClan.values()]
			.filter((b) => b.appearances > 0)
			.map((b) => ({
				clan_id: b.clan_id,
				tag: b.tag,
				name: b.name,
				sessions: b.sessions.size,
				appearances: b.appearances,
				kills: b.kills,
				deaths: b.deaths,
				assists: b.assists,
				kd: kdOf(b.kills, b.deaths),
				kda: kdaOf(b.kills, b.deaths, b.assists),
			}))
			.sort((x, y) => y.kills - x.kills)
		// разбивка по картам: победы сессии + мои K/D на карте
		const byMap = new Map<
			string,
			{ sessions: number; wins: number; losses: number; kills: number; deaths: number }
		>()
		for (const s of all) {
			if (!played.has(s.id)) continue
			const key = s.map_name?.trim() || '—'
			const b = byMap.get(key) ?? {
				sessions: 0,
				wins: 0,
				losses: 0,
				kills: 0,
				deaths: 0,
			}
			b.sessions++
			const summary = s.ai_summary as {
				victory?: boolean | null
				teams?: { name: string; is_player_clan?: boolean }[]
			} | null
			let v = summary?.victory ?? null
			if (v == null) {
				let w = 0
				let l = 0
				for (const shot of s.screenshots) {
					const r = shot.ai_result as {
						victory?: boolean | null
						total_score?: number | null
						opponent_score?: number | null
					} | null
					const sv =
						r?.victory ??
						(r?.total_score != null && r?.opponent_score != null
							? r.total_score > r.opponent_score
								? true
								: r.total_score < r.opponent_score
									? false
									: null
							: null)
					if (sv === true) w++
					else if (sv === false) l++
				}
				v = w + l > 0 ? w >= l : null
			}
			if (v === true) b.wins++
			else if (v === false) b.losses++
			for (const p of per_stage) {
				if (p.session_id !== s.id) continue
				b.kills += p.kills
				b.deaths += p.deaths
			}
			byMap.set(key, b)
		}
		const per_map = [...byMap.entries()].map(([map, b]) => {
			const decided = b.wins + b.losses
			return {
				map,
				sessions: b.sessions,
				wins: b.wins,
				losses: b.losses,
				winrate: decided > 0 ? b.wins / decided : 0,
				kills: b.kills,
				deaths: b.deaths,
				kd: kdOf(b.kills, b.deaths),
			}
		})
		per_map.sort((x, y) => y.sessions - x.sessions || y.kd - x.kd)
		return {
			sessions: played.size,
			appearances,
			kills,
			deaths,
			assists,
			kd: kdOf(kills, deaths),
			kda: kdaOf(kills, deaths, assists),
			per_clan,
			per_stage,
			per_map,
		}
	}
}

export const personalService = new PersonalService()
