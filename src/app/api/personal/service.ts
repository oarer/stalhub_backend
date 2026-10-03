import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { analyticsService } from '@/app/api/clan/services/analytics'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import type { PlayerResponse } from '@/types/player.type'
import { decryptSecretJson, encryptSecret } from '@/utils/crypto'

interface ExboCharacterEntry {
	information: { id: string; name: string }
}

const UPLOAD_DIR = path.resolve('uploads', 'screenshots')

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
		await prisma.personalProfile.deleteMany({ where: { user_id } })
		return { success: true }
	}

	async setVisibility(
		user_id: number,
		is_public: boolean,
		public_fields?: string[]
	) {
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

	async getPublic(username: string) {
		const user = await prisma.user.findUnique({
			where: { username },
			select: { id: true, username: true, name: true },
		})
		if (!user) return null
		const profile = await prisma.personalProfile.findUnique({
			where: { user_id: user.id },
		})
		if (!profile || !profile.is_public) return null
		const snapshots = await this.getSnapshots(user.id, { limit: 500 })
		return {
			user: { username: user.username, name: user.name },
			profile: {
				region: profile.region,
				character_name: profile.character_name,
				public_fields: profile.public_fields,
				last_snapshot_at: profile.last_snapshot_at,
			},
			snapshots,
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
		await mkdir(UPLOAD_DIR, { recursive: true })
		const ext = path.extname(file.name) || '.png'
		const filename = `${session_id}-personal-${randomUUID()}${ext}`
		const fullPath = path.join(UPLOAD_DIR, filename)
		const relativePath = path.join('uploads', 'screenshots', filename)
		await writeFile(fullPath, file.buffer)
		const row = await prisma.stageScreenshot.create({
			data: {
				session_id,
				file_path: relativePath,
				mime_type: file.type,
				size_bytes: file.buffer.length,
			},
		})
		void analyticsService.runAnalysis(row.id, fullPath)
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
			try {
				await rm(shot.file_path, { force: true })
			} catch {}
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
		if (!profile) return { sessions: 0, appearances: 0, kills: 0, per_stage: [] }
		const sessions = await prisma.stageSession.findMany({
			where: { creator_id: user_id, clan_id: null },
			orderBy: { started_at: 'desc' },
			take: 100,
			include: {
				screenshots: {
					where: { ai_status: 'done' },
					select: { ai_result: true },
				},
			},
		})
		const name = profile.character_name.toLowerCase()
		let appearances = 0
		let kills = 0
		const per_stage: { session_id: number; kills: number; deaths: number }[] = []
		for (const s of sessions) {
			for (const shot of s.screenshots) {
				const r = shot.ai_result as {
					players?: { name: string; kills?: number; deaths?: number }[]
				} | null
				const me = r?.players?.find(
					(p) => p.name.trim().toLowerCase() === name
				)
				if (me) {
					appearances++
					kills += me.kills ?? 0
					per_stage.push({
						session_id: s.id,
						kills: me.kills ?? 0,
						deaths: me.deaths ?? 0,
					})
				}
			}
		}
		return { sessions: sessions.length, appearances, kills, per_stage }
	}
}

export const personalService = new PersonalService()
