import { env } from '@/env'
import { prisma } from '@/lib/prisma'

type LauncherSource = {
	region: string
	url: string
}

type LauncherEntry = {
	id: string
	onlineCurrent: number
}

type LauncherResponse = {
	success: boolean
	data?: string
}

function loadSources(): LauncherSource[] {
	try {
		const parsed = JSON.parse(env.LAUNCHER_SOURCES) as unknown
		if (!Array.isArray(parsed)) {
			console.error('[ServerOnline] LAUNCHER_SOURCES must be an array')
			return []
		}
		return parsed.filter(
			(s): s is LauncherSource =>
				typeof s === 'object' &&
				s !== null &&
				typeof (s as LauncherSource).region === 'string' &&
				typeof (s as LauncherSource).url === 'string'
		)
	} catch (err) {
		console.error('[ServerOnline] Invalid LAUNCHER_SOURCES env:', err)
		return []
	}
}

const SOURCES = loadSources()

function parseOnline(
	region: string,
	raw: string
): Array<{ serverId: string; online: number }> {
	try {
		const entries = JSON.parse(raw) as LauncherEntry[]
		return entries
			.filter((e) => typeof e.onlineCurrent === 'number')
			.map((e) => ({ serverId: e.id, online: e.onlineCurrent }))
	} catch (err) {
		console.error(`[ServerOnline] Failed to parse ${region} response:`, err)
		return []
	}
}

class ServerOnlineService {
	async snapshot() {
		const rows: Array<{
			region: string
			server_id: string
			online: number
		}> = []

		for (const source of SOURCES) {
			try {
				const res = await fetch(source.url)
				if (!res.ok) {
					console.error(
						`[ServerOnline] ${source.region} responded ${res.status}`
					)
					continue
				}

				const body = (await res.json()) as LauncherResponse

				if (!body.success || !body.data) {
					console.error(
						`[ServerOnline] ${source.region} returned invalid data`
					)
					continue
				}

				for (const entry of parseOnline(source.region, body.data)) {
					rows.push({
						region: source.region,
						server_id: entry.serverId,
						online: entry.online,
					})
				}
			} catch (err) {
				console.error(
					`[ServerOnline] Failed to fetch ${source.region}:`,
					err
				)
			}
		}

		if (rows.length === 0) return { created: 0 }

		await prisma.serverOnlineSnapshot.createMany({ data: rows })

		return { created: rows.length }
	}

	async latest() {
		const snapshots = await prisma.serverOnlineSnapshot.findMany({
			orderBy: { created_at: 'desc' },
			take: 100,
		})

		const map = new Map<string, { online: number; updatedAt: Date }>()
		for (const s of snapshots) {
			const key = `${s.region}|${s.server_id}`
			if (map.has(key)) continue
			map.set(key, { online: s.online, updatedAt: s.created_at })
		}

		return Array.from(map.entries()).map(([key, value]) => {
			const [region, serverId] = key.split('|')
			return { region, serverId, ...value }
		})
	}

	async history(hours: number) {
		const start = new Date(Date.now() - hours * 60 * 60 * 1000)

		const snapshots = await prisma.serverOnlineSnapshot.findMany({
			where: { created_at: { gte: start } },
			orderBy: { created_at: 'asc' },
		})

		// Every snapshot batch lands at roughly the same moment, so coalesce
		// rows into 5-minute buckets and sum the online of all servers per
		// region to build a clean time series.
		const BUCKET_MS = 5 * 60 * 1000
		const map = new Map<string, { createdAt: Date; online: number }>()
		for (const s of snapshots) {
			const bucket = new Date(
				Math.round(s.created_at.getTime() / BUCKET_MS) * BUCKET_MS
			)
			const key = `${s.region}|${bucket.getTime()}`
			const found = map.get(key)
			if (found) {
				found.online += s.online
			} else {
				map.set(key, { createdAt: bucket, online: s.online })
			}
		}

		return Array.from(map.entries()).map(([key, value]) => {
			const [region] = key.split('|')
			return { region, ...value }
		})
	}
}

export const serverOnlineService = new ServerOnlineService()
