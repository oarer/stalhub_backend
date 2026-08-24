import type { StageType } from 'generated/prisma/enums'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { mskNow } from '@/lib/msk'
import { decryptSecretJson, encryptSecret } from '@/utils/crypto'
import type { GrenadeStats } from './cache'
import * as cache from './cache'
import { normalizeSchedule } from './clan'

type PoolToken = {
	id: number
	access_token: string
	refresh_token?: string
	access_expires_at: Date
	refresh_expires_at?: Date | null
}

export class GrenadesService {
	private poolIndex = new Map<string, number>()

	async getForCharacter(
		region: string,
		character: string,
		token?: string,
		options: { skipCache?: boolean } = {}
	) {
		if (!options.skipCache) {
			const cached = await cache.getGrenades(region, character)
			if (cached) return cached
		}

		const { data } = await apiClient.get<{
			stats: Array<{ id: string; value: number | string }>
		}>(`/${region}/character/by-name/${character}/profile`, {
			headers: token ? { Authorization: `Bearer ${token}` } : undefined,
			_skipAuth: token ? true : false,
		} as never)
		const stat = data.stats.find((s) => s.id === 'gre-thr')
		const total = stat ? Number(stat.value) : 0
		const result: GrenadeStats = {
			character,
			region,
			total,
			stat_id: 'gre-thr',
			fetched_at: new Date().toISOString(),
		}
		await cache.setGrenades(region, character, result)
		return result
	}

	private async getPoolTokens(): Promise<PoolToken[]> {
		const rows = await prisma.clanMember.findMany({
			include: {
				user: {
					include: {
						exbo_auth: {
							select: {
								id: true,
								token_blob: true,
								access_expires_at: true,
								refresh_expires_at: true,
							},
						},
					},
				},
			},
		})

		const now = new Date()
		const tokens: PoolToken[] = []

		for (const m of rows) {
			const auth = m.user?.exbo_auth
			if (!auth) continue

			const blob = decryptSecretJson<{
				access_token: string
				refresh_token?: string
			}>(auth.token_blob)

			if (!blob.access_token) continue

			const canRefresh =
				auth.refresh_expires_at && auth.refresh_expires_at > now

			if (auth.access_expires_at > now || canRefresh) {
				tokens.push({
					id: auth.id,
					access_token: blob.access_token,
					refresh_token: blob.refresh_token,
					access_expires_at: auth.access_expires_at,
					refresh_expires_at: auth.refresh_expires_at,
				})
			}
		}

		return tokens
	}

	private async refreshExboToken(authId: number, refreshToken: string) {
		try {
			const body = new URLSearchParams({
				client_id: env.EXBO_CLIENT_ID,
				client_secret: env.EXBO_CLIENT_SECRET,
				refresh_token: refreshToken,
				grant_type: 'refresh_token',
			})

			const res = await fetch('https://exbo.net/oauth/token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body,
			})

			if (!res.ok) {
				console.error(
					`[Grenades] EXBO token refresh failed for auth #${authId}: HTTP ${res.status}`
				)
				return null
			}

			const data = (await res.json()) as {
				access_token: string
				refresh_token?: string
				expires_in: number
				refresh_expires_in?: number
			}

			const newBlob = encryptSecret(
				JSON.stringify({
					access_token: data.access_token,
					refresh_token: data.refresh_token ?? refreshToken,
				})
			)

			await prisma.eXBOAuth.update({
				where: { id: authId },
				data: {
					token_blob: newBlob,
					access_expires_at: new Date(
						Date.now() + data.expires_in * 1000
					),
					refresh_expires_at: data.refresh_expires_in
						? new Date(Date.now() + data.refresh_expires_in * 1000)
						: undefined,
				},
			})

			return data.access_token as string
		} catch (err) {
			console.error(
				`[Grenades] EXBO token refresh error for auth #${authId}:`,
				err
			)
			return null
		}
	}

	private pickToken(pool: PoolToken[], clan_id: string): PoolToken | null {
		if (pool.length === 0) return null
		const idx = this.poolIndex.get(clan_id) ?? 0
		const token = pool[idx % pool.length]!
		this.poolIndex.set(clan_id, idx + 1)
		return token
	}

	async takeSnapshot(
		clan_id: string,
		event_type: StageType,
		checkpoint: string
	) {
		const clan = await prisma.clan.findUnique({
			where: { id: clan_id },
			select: { region: true, schedule: true },
		})
		if (!clan)
			return { clan_id, event_type, checkpoint, count: 0, skipped: true }

		const { sunday_activity } = normalizeSchedule(clan.schedule)

		if (sunday_activity === 'NONE') {
			console.log(
				`[Grenades] ${clan_id} ${event_type}/${checkpoint}: skipped, clan does not play on Sunday`
			)
			return { clan_id, event_type, checkpoint, count: 0, skipped: true }
		}

		if (mskNow().getUTCDay() === 0 && event_type !== sunday_activity) {
			console.log(
				`[Grenades] ${clan_id} ${event_type}/${checkpoint}: skipped, clan plays ${sunday_activity} on Sunday`
			)
			return { clan_id, event_type, checkpoint, count: 0, skipped: true }
		}

		const members = await prisma.clanMember.findMany({
			where: { clan_id },
			select: { name: true },
		})

		const pool = await this.getPoolTokens()

		if (pool.length === 0) {
			throw new Error(
				`[Grenades] ${clan_id} ${event_type}/${checkpoint}: token pool is empty; snapshot was not saved`
			)
		}

		const results = await Promise.all(
			members.map(async (m) => {
				const picked = this.pickToken(pool, clan_id)
				if (!picked) return null

				const now = new Date()
				let token = picked.access_token

				if (picked.access_expires_at <= now) {
					if (picked.refresh_token) {
						const refreshed = await this.refreshExboToken(
							picked.id,
							picked.refresh_token
						)
						if (!refreshed) {
							console.warn(
								`[Grenades] ${clan_id}: token refresh failed for auth #${picked.id}, skipping ${m.name}`
							)
							return null
						}
						token = refreshed
					} else {
						console.warn(
							`[Grenades] ${clan_id}: access token expired and no refresh_token for auth #${picked.id}, skipping ${m.name}`
						)
						return null
					}
				}

				return this.getForCharacter(clan.region, m.name, token, {
					skipCache: true,
				})
					.then((r) => ({ name: r.character, total: r.total }))
					.catch((err) => {
						const status =
							typeof err === 'object' && err !== null && 'status' in err
								? (err as { status: unknown }).status
								: 'unknown'
						const message =
							err instanceof Error
								? err.message
								: typeof err === 'object' &&
									  err !== null &&
									  'message' in err
									? String((err as { message: unknown }).message)
									: String(err)
						console.warn(
							`[Grenades] ${clan_id}: failed to fetch stats for ${m.name}: ${status} ${message}`
						)
						return null
					})
			})
		)
		const snapshot = results.filter(
			(r): r is NonNullable<typeof r> => r !== null
		)

		if (snapshot.length < members.length) {
			console.warn(
				`[Grenades] ${clan_id} ${event_type}/${checkpoint}: only ${snapshot.length}/${members.length} members fetched`
			)
		}
		const raidDate = new Date()

		await prisma.grenadeSnapshot.create({
			data: {
				clan_id,
				event_type: event_type,
				checkpoint,
				raid_date: raidDate,
				members: snapshot as never,
			},
		})
		console.log(
			`[Grenades] ${clan_id} ${event_type}/${checkpoint}: saved ${snapshot.length}/${members.length} members (pool: ${pool.length} tokens)`
		)
		return {
			clan_id,
			event_type,
			checkpoint,
			count: snapshot.length,
			skipped: false,
		}
	}

	async takeSnapshotAll(event_type: StageType, checkpoint: string) {
		const clans = await prisma.clan.findMany({
			where: { status: 'ACTIVE' },
		})
		const results = await Promise.allSettled(
			clans.map((c) => this.takeSnapshot(c.id, event_type, checkpoint))
		)
		for (const r of results) {
			if (r.status === 'rejected') {
				console.error(
					`[Grenades] takeSnapshotAll ${event_type}/${checkpoint}: clan snapshot failed:`,
					r.reason
				)
			}
		}
		console.log(
			`[Grenades] takeSnapshotAll ${event_type}/${checkpoint}: ${results.filter((r) => r.status === 'fulfilled').length}/${clans.length} clans processed`
		)
		return results
			.filter((r) => r.status === 'fulfilled')
			.map((r) => r.value)
	}

	async getForClanStages(clan_id: string) {
		const rows = await prisma.grenadeSnapshot.findMany({
			where: { clan_id },
			orderBy: { raid_date: 'asc' },
		})

		const groups = new Map<string, typeof rows>()
		for (const row of rows) {
			const key = `${row.event_type}|${this.mskDate(row.raid_date)}`
			const group = groups.get(key)
			if (group) group.push(row)
			else groups.set(key, [row])
		}

		const events = [...groups.values()]
			.map((group) => this.buildEvent(group))
			.sort((a, b) => b.raid_date.localeCompare(a.raid_date))
			.slice(0, 10)
			.filter((e) => e.stages.length > 0)

		const eventsWithBoxes = await Promise.all(
			events.map(async (event) => {
				const { boxes } = await this.getBoxes(clan_id, event.raid_date)
				return { ...event, boxes }
			})
		)

		return { events: eventsWithBoxes }
	}

	async getAllTime(clan_id: string) {
		const rows = await prisma.grenadeSnapshot.findMany({
			where: { clan_id },
			orderBy: { raid_date: 'asc' },
		})

		const totals = new Map<string, number>()
		for (const row of rows) {
			for (const m of row.members as GrenadeSnapshotMember[]) {
				const total = Number(m.total) || 0
				totals.set(m.name, Math.max(totals.get(m.name) ?? 0, total))
			}
		}

		return {
			members: [...totals.entries()]
				.map(([name, grenades]) => ({ name, grenades }))
				.sort((a, b) => b.grenades - a.grenades),
		}
	}

	private mskDate(d: Date): string {
		return new Date(d.getTime() + 3 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10)
	}

	private buildEvent(group: GrenadeSnapshot[]) {
		const byCheckpoint = new Map<string, GrenadeSnapshot>()
		for (const row of group) {
			const current = byCheckpoint.get(row.checkpoint)
			if (!current || row.raid_date > current.raid_date) {
				byCheckpoint.set(row.checkpoint, row)
			}
		}

		const checkpoints = CHECKPOINT_ORDER.filter((c) => byCheckpoint.has(c))
		const stages = []
		for (let i = 0; i < checkpoints.length - 1; i++) {
			const prev = this.membersMap(byCheckpoint.get(checkpoints[i])!)
			const next = this.membersMap(byCheckpoint.get(checkpoints[i + 1])!)
			const names = [...new Set([...prev.keys(), ...next.keys()])]

			const members = names
				.map((name) => {
					if (!prev.has(name) || !next.has(name)) return null
					return {
						name,
						grenades: Math.max(
							0,
							(next.get(name) ?? 0) - (prev.get(name) ?? 0)
						),
					}
				})
				.filter(
					(m): m is { name: string; grenades: number } => m !== null
				)
				.sort((a, b) => b.grenades - a.grenades)

			stages.push({
				stage: i + 1,
				checkpoints: [checkpoints[i], checkpoints[i + 1]],
				members,
			})
		}

		const totals = new Map<string, number>()
		for (const stage of stages) {
			for (const m of stage.members) {
				totals.set(m.name, (totals.get(m.name) ?? 0) + m.grenades)
			}
		}
		const total = [...totals.entries()]
			.map(([name, grenades]) => ({ name, grenades }))
			.sort((a, b) => b.grenades - a.grenades)

		return {
			event_type: group[0]!.event_type,
			raid_date: this.mskDate(group[0]!.raid_date),
			stages,
			total,
		}
	}

	private membersMap(snapshot: GrenadeSnapshot) {
		const map = new Map<string, number>()
		for (const m of snapshot.members as GrenadeSnapshotMember[]) {
			map.set(m.name, Number(m.total) || 0)
		}
		return map
	}

	private static readonly PERMANENT_DATE = 'permanent'

	async getBoxes(clan_id: string, date?: string) {
		const resolvedDate = date ?? GrenadesService.PERMANENT_DATE
		const boxes = await prisma.grenadeBox.findMany({
			where: { clan_id, date: resolvedDate },
			orderBy: { created_at: 'asc' },
		})
		return { boxes }
	}

	async addBox(
		clan_id: string,
		entry: { name: string; type: string; count: number }
	) {
		const date = GrenadesService.PERMANENT_DATE
		const existing = await prisma.grenadeBox.findFirst({
			where: { clan_id, date, name: entry.name, type: entry.type },
		})

		if (existing) {
			await prisma.grenadeBox.update({
				where: { id: existing.id },
				data: { count: existing.count + entry.count },
			})
		} else {
			await prisma.grenadeBox.create({
				data: {
					clan_id,
					date,
					name: entry.name,
					type: entry.type,
					count: entry.count,
				},
			})
		}

		return this.getBoxes(clan_id)
	}

	async removeBox(clan_id: string, index: number) {
		const boxes = await prisma.grenadeBox.findMany({
			where: { clan_id, date: GrenadesService.PERMANENT_DATE },
			orderBy: { created_at: 'asc' },
		})
		if (boxes[index]) {
			await prisma.grenadeBox.delete({ where: { id: boxes[index].id } })
		}
		return this.getBoxes(clan_id)
	}
}

const CHECKPOINT_ORDER = [
	'BEFORE_STAGES',
	'BETWEEN_1_2',
	'BETWEEN_2_3',
	'BETWEEN_3_4',
	'AFTER_STAGES',
]

type GrenadeSnapshotMember = { name: string; total: number }
type GrenadeSnapshot = {
	event_type: string
	checkpoint: string
	raid_date: Date
	members: unknown
}
export const grenadesService = new GrenadesService()
