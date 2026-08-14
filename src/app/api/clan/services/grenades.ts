import type { StageType } from 'generated/prisma/enums'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { prisma } from '@/lib/prisma'
import { decryptSecretJson } from '@/utils/crypto'
import type { GrenadeStats } from './cache'
import * as cache from './cache'

export class GrenadesService {
	async getForCharacter(region: string, character: string, token?: string) {
		const cached = await cache.getGrenades(region, character)
		if (cached) return cached

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

	async takeSnapshot(
		clanId: string,
		eventType: StageType,
		checkpoint: string
	) {
		const clan = await prisma.clan.findUnique({
			where: { id: clanId },
			select: { region: true },
		})
		if (!clan) return { clanId, eventType, checkpoint, count: 0 }

		const members = await prisma.clanMember.findMany({
			where: { clanId },
			include: {
				user: {
					include: { EXBOAuth: { select: { token_blob: true } } },
				},
			},
		})
		const results = await Promise.all(
			members.map((m) => {
				if (!m.user?.EXBOAuth) return Promise.resolve(null)
				const { access_token: token } = decryptSecretJson<{
					access_token: string
				}>(m.user.EXBOAuth.token_blob)
				if (!token) return Promise.resolve(null)
				return this.getForCharacter(clan.region, m.name, token)
					.then((r) => ({ name: r.character, total: r.total }))
					.catch(() => null)
			})
		)
		const snapshot = results.filter(
			(r): r is NonNullable<typeof r> => r !== null
		)
		const raidDate = new Date()

		await prisma.grenadeSnapshot.create({
			data: {
				clanId,
				event_type: eventType,
				checkpoint,
				raid_date: raidDate,
				members: snapshot as never,
			},
		})
		return { clanId, eventType, checkpoint, count: snapshot.length }
	}

	async takeSnapshotAll(eventType: StageType, checkpoint: string) {
		const clans = await prisma.clan.findMany({
			where: { status: 'ACTIVE' },
		})
		const results = await Promise.allSettled(
			clans.map((c) => this.takeSnapshot(c.id, eventType, checkpoint))
		)
		return results
			.filter((r) => r.status === 'fulfilled')
			.map((r) => r.value)
	}

	async getForClanStages(clanId: string) {
		const rows = await prisma.grenadeSnapshot.findMany({
			where: { clanId },
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

		return { events }
	}

	async getAllTime(clanId: string) {
		const rows = await prisma.grenadeSnapshot.findMany({
			where: { clanId },
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
