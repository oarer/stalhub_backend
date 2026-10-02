import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/utils/crypto'
import { peekNodeUsage, tryReserveNode } from './quota'

export interface ScNode {
	id: number
	name: string
	base_url: string
	api_key: string
	priority: number
	timeout_ms: number
}

const CACHE_TTL_MS = 10_000

let cache: { at: number; nodes: ScNode[] } | null = null
let roundRobin = 0

export async function listNodes(): Promise<ScNode[]> {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.nodes
	const rows = await prisma.scApiNode.findMany({
		where: { enabled: true },
		orderBy: [{ priority: 'desc' }, { id: 'asc' }],
	})
	const nodes = rows.map((r) => ({
		id: r.id,
		name: r.name,
		base_url: r.base_url.replace(/\/+$/, ''),
		api_key: r.api_key ? decryptSecret(r.api_key) : '',
		priority: r.priority,
		timeout_ms: r.timeout_ms,
	}))
	cache = { at: Date.now(), nodes }
	return nodes
}

export function invalidateNodeCache(): void {
	cache = null
}

/**
 * Round-robin pick among enabled nodes with free egress-IP quota.
 * Atomically reserves `cost` units of the node quota (800/min);
 * IP-exhausted nodes are skipped. Use 'direct' node id for the
 * backend's own egress IP.
 */
export async function pickNode(
	cost: number,
	excludeIds: Set<number> = new Set()
): Promise<ScNode | null> {
	const nodes = await listNodes()
	const available = nodes.filter((n) => !excludeIds.has(n.id))
	for (let i = 0; i < available.length; i++) {
		roundRobin = (roundRobin + 1) % available.length
		const node = available[roundRobin]!
		if (excludeIds.has(node.id)) continue
		const reserved = await tryReserveNode(node.id, cost)
		if (reserved.ok) return node
		excludeIds.add(node.id)
	}
	return null
}

export async function nodeUsageSnapshot(): Promise<
	Record<number, { used: number; remaining: number; reset_at: string }>
> {
	const nodes = await listNodes()
	const entries = await Promise.all(
		nodes.map(async (n) => [n.id, await peekNodeUsage(n.id)] as const)
	)
	return Object.fromEntries(entries)
}

export async function markNodeSeen(id: number): Promise<void> {
	invalidateNodeCache()
	await prisma.scApiNode
		.update({
			where: { id },
			data: { last_seen_at: new Date(), last_error: null },
		})
		.catch(() => undefined)
}

export async function markNodeError(
	id: number,
	message: string
): Promise<void> {
	invalidateNodeCache()
	await prisma.scApiNode
		.update({
			where: { id },
			data: { last_error: message.slice(0, 500) },
		})
		.catch(() => undefined)
}
