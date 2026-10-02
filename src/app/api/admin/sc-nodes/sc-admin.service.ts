import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/utils/crypto'
import {
	QUOTA_PER_MINUTE_NODE,
	QUOTA_PER_MINUTE_TOKEN,
} from '@/app/api/sc-gateway/config'
import { invalidateNodeCache } from '@/app/api/sc-gateway/nodes'
import { peekNodeUsage } from '@/app/api/sc-gateway/quota'
import {
	scGatewayNodesUp,
	scGatewayTokensUp,
} from '@/app/api/sc-gateway/sc-metrics'
import {
	invalidateTokenCache,
	storeTokens,
	tailOf,
	tokenUsageSnapshot,
} from '@/app/api/sc-gateway/pool'

function hashToken(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

export const scAdminService = {
	quotaPerMinute: QUOTA_PER_MINUTE_TOKEN,
	nodeQuotaPerMinute: QUOTA_PER_MINUTE_NODE,

	// ---------- nodes ----------

	async listNodes() {
		const rows = await prisma.scApiNode.findMany({
			orderBy: [{ priority: 'desc' }, { id: 'asc' }],
		})
		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			base_url: r.base_url,
			has_api_key: !!r.api_key,
			enabled: r.enabled,
			priority: r.priority,
			timeout_ms: r.timeout_ms,
			last_seen_at: r.last_seen_at,
			last_error: r.last_error,
			created_at: r.created_at,
			updated_at: r.updated_at,
		}))
	},

	async createNode(input: {
		name: string
		base_url: string
		api_key?: string
		priority?: number
		timeout_ms?: number
		enabled?: boolean
	}) {
		const row = await prisma.scApiNode.create({
			data: {
				name: input.name.trim(),
				base_url: input.base_url.trim().replace(/\/+$/, ''),
				api_key: input.api_key?.trim()
					? encryptSecret(input.api_key.trim())
					: '',
				priority: input.priority ?? 0,
				timeout_ms: input.timeout_ms ?? 10000,
				enabled: input.enabled ?? true,
			},
		})
		invalidateNodeCache()
		return { id: row.id, name: row.name }
	},

	async updateNode(
		id: number,
		input: {
			name?: string
			base_url?: string
			api_key?: string
			priority?: number
			timeout_ms?: number
			enabled?: boolean
		}
	) {
		const data: Record<string, unknown> = {}
		if (input.name !== undefined) data.name = input.name.trim()
		if (input.base_url !== undefined)
			data.base_url = input.base_url.trim().replace(/\/+$/, '')
		if (input.api_key !== undefined)
			data.api_key = input.api_key.trim()
				? encryptSecret(input.api_key.trim())
				: ''
		if (input.priority !== undefined) data.priority = input.priority
		if (input.timeout_ms !== undefined) data.timeout_ms = input.timeout_ms
		if (input.enabled !== undefined) data.enabled = input.enabled
		const row = await prisma.scApiNode.update({ where: { id }, data })
		invalidateNodeCache()
		return { id: row.id, name: row.name }
	},

	async deleteNode(id: number) {
		await prisma.scApiNode.delete({ where: { id } })
		invalidateNodeCache()
		return { success: true }
	},

	async pingNode(id: number) {
		const node = await prisma.scApiNode.findUnique({ where: { id } })
		if (!node) return null
		const started = Date.now()
		try {
			const res = await fetch(
				`${node.base_url.replace(/\/+$/, '')}/health`,
				{ signal: AbortSignal.timeout(node.timeout_ms) }
			)
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			const latency_ms = Date.now() - started
			await prisma.scApiNode.update({
				where: { id },
				data: { last_seen_at: new Date(), last_error: null },
			})
			invalidateNodeCache()
			return { ok: true, latency_ms }
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Ping failed'
			await prisma.scApiNode.update({
				where: { id },
				data: { last_error: message.slice(0, 500) },
			})
			invalidateNodeCache()
			return { ok: false, error: message }
		}
	},

	// ---------- tokens ----------

	async listTokens() {
		return tokenUsageSnapshot()
	},

	async createToken(input: { label?: string; token: string }) {
		const value = input.token.trim()
		if (!value) return { error: 'Token is required' }
		const exists = await prisma.scApiToken.findUnique({
			where: { token_hash: hashToken(value) },
		})
		if (exists) return { error: 'Token already exists', id: exists.id }
		const row = await prisma.scApiToken.create({
			data: {
				label: input.label?.trim() || '',
				token_encrypted: encryptSecret(value),
				token_hash: hashToken(value),
				token_tail: tailOf(value),
			},
		})
		invalidateTokenCache()
		return { id: row.id, label: row.label, tail: row.token_tail }
	},

	/** Bulk upload: newline/comma/space separated text or string array. */
	async bulkTokens(input: { tokens: string | string[]; label?: string }) {
		const raw = Array.isArray(input.tokens)
			? input.tokens
			: input.tokens.split(/[\s,;]+/)
		const values = raw.map((t) => t.trim()).filter(Boolean)
		const result = await storeTokens(
			values.map((value, i) => ({
				value,
				label: input.label ? `${input.label} #${i + 1}` : '',
			}))
		)
		return { ...result, total: values.length }
	},

	async updateToken(id: number, input: { label?: string; enabled?: boolean }) {
		const data: Record<string, unknown> = {}
		if (input.label !== undefined) data.label = input.label.trim()
		if (input.enabled !== undefined) data.enabled = input.enabled
		const row = await prisma.scApiToken.update({ where: { id }, data })
		invalidateTokenCache()
		return { id: row.id, label: row.label, enabled: row.enabled }
	},

	async deleteToken(id: number) {
		await prisma.scApiToken.delete({ where: { id } })
		invalidateTokenCache()
		return { success: true }
	},

	// ---------- overview ----------

	async overview() {
		const [nodes, tokens, dbNodes, dbTokens] = await Promise.all([
			scAdminService.listNodes(),
			tokenUsageSnapshot(),
			prisma.scApiNode.findMany({
				where: { enabled: true },
				select: { id: true },
			}),
			prisma.scApiToken.findMany({
				where: { enabled: true },
				select: { id: true },
			}),
		])
		const nodesWithUsage = await Promise.all(
			nodes.map(async (n) => ({ ...n, ...(await peekNodeUsage(n.id)) }))
		)
		scGatewayNodesUp.set(dbNodes.length)
		scGatewayTokensUp.set(dbTokens.length)
		return {
			quota_per_minute: QUOTA_PER_MINUTE_TOKEN,
			node_quota_per_minute: QUOTA_PER_MINUTE_NODE,
			costs: { default: 1, auction: 2 },
			nodes_up: dbNodes.length,
			tokens_up: dbTokens.length,
			nodes: nodesWithUsage,
			tokens,
		}
	},
}
