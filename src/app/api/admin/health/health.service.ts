import { cronStatus } from '@/lib/cron-status'
import { prisma } from '@/lib/prisma'
import { httpRequestDuration, httpRequestsTotal } from '../../metrics'
import { serverOnlineService } from '../../server-online/server-online.service'
import { dashboardService } from '../dashboard/dashboard.service'
import { scAdminService } from '../sc-nodes/sc-admin.service'

interface PromSample {
	labels: Record<string, string | number>
	value: number
	metricName: string
}

function asSamples(values: unknown): PromSample[] {
	if (!Array.isArray(values)) return []
	return values.filter(
		(v): v is PromSample =>
			!!v && typeof v === 'object' && 'value' in v && 'labels' in v
	)
}

const P95_TARGET = 0.95

function estimateP95(samples: PromSample[]): number {
	const series = new Map<
		string,
		{ le: number[]; counts: number[]; count: number }
	>()
	for (const s of samples) {
		const route = String(s.labels.route ?? 'unknown')
		const leRaw = s.labels.le
		const entry = series.get(route) ?? { le: [], counts: [], count: 0 }
		if (typeof leRaw === 'string' || typeof leRaw === 'number') {
			const le = leRaw === '+Inf' ? Infinity : Number(leRaw)
			entry.le.push(le)
			entry.counts.push(s.value)
		} else {
			entry.count = s.value
		}
		series.set(route, entry)
	}

	let requests = 0
	let weighted = 0
	for (const entry of series.values()) {
		const count = entry.count
		if (!count) continue
		requests += count
		const sorted = entry.le
			.map((le, i) => ({ le, cumulative: entry.counts[i] }))
			.sort((a, b) => a.le - b.le)
		const target = count * P95_TARGET
		const hit = sorted.find((b) => b.cumulative >= target)
		const upper = hit ? Math.min(hit.le, 5) : 5
		weighted += upper * count
	}

	return requests > 0 ? weighted / requests : 0
}

async function runtimeMetrics() {
	const [counterData, histogramData] = await Promise.all([
		httpRequestsTotal.get(),
		httpRequestDuration.get(),
	])

	const samples = asSamples(counterData.values)
	let requests_total = 0
	const by_status: Record<string, number> = {}
	const errors_by_route = new Map<string, number>()

	for (const s of samples) {
		const status = String(s.labels.status ?? '?')
		const route = String(s.labels.route ?? 'unknown')
		requests_total += s.value
		by_status[status] = (by_status[status] ?? 0) + s.value
		if (status.startsWith('5')) {
			errors_by_route.set(
				route,
				(errors_by_route.get(route) ?? 0) + s.value
			)
		}
	}

	const durationSamples = asSamples(histogramData.values).filter(
		(s) => s.metricName === 'http_request_duration_seconds_bucket'
	)
	const p95_seconds = estimateP95(durationSamples)
	const countSample = asSamples(histogramData.values).find(
		(s) => s.metricName === 'http_request_duration_seconds_sum'
	)

	const top_5xx = Array.from(errors_by_route.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([route, count]) => ({ route, count }))

	return {
		requests_total,
		by_status,
		top_5xx,
		p95_seconds: Number(p95_seconds.toFixed(3)),
		request_seconds_total: countSample
			? Number(countSample.value.toFixed(3))
			: 0,
		uptime_seconds: Number(process.uptime().toFixed(0)),
		mem_heap_mb: Number(
			(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
		),
	}
}

async function serverOnlineSummary() {
	const latest = await serverOnlineService
		.latest()
		.catch(
			() => [] as { region: string; server_id: string; online: number }[]
		)

	const perRegion = new Map<
		string,
		{ region: string; online: number; servers: number }
	>()
	for (const s of latest) {
		const entry = perRegion.get(s.region) ?? {
			region: s.region,
			online: 0,
			servers: 0,
		}
		entry.online += s.online
		entry.servers += 1
		perRegion.set(s.region, entry)
	}

	const topServers = [...latest]
		.sort((a, b) => b.online - a.online)
		.slice(0, 10)

	return {
		regions: Array.from(perRegion.values()).sort(
			(a, b) => b.online - a.online
		),
		top_servers: topServers,
	}
}

export const healthService = {
	async snapshot() {
		const [runtime, nodes, online, dbRows, summary] = await Promise.all([
			runtimeMetrics(),
			scAdminService
				.listNodes()
				.catch(
					() =>
						[] as Awaited<
							ReturnType<typeof scAdminService.listNodes>
						>
				),
			serverOnlineSummary(),
			prisma.$queryRaw<{ db_size: string }[]>`
				SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
			`.catch(() => [{ db_size: 'unknown' }]),
			dashboardService.summary(1),
		])

		return {
			generated_at: new Date().toISOString(),
			uptime_seconds: runtime.uptime_seconds,
			crons: Array.from(cronStatus.values()).map((c) => ({
				...c,
				next_interval_hint: c.pattern,
			})),
			runtime,
			sc_nodes: nodes,
			server_online: online,
			db_size: dbRows[0]?.db_size ?? 'unknown',
			users: summary.users,
			moderation: summary.moderation,
			content: summary.content,
		}
	},
}
