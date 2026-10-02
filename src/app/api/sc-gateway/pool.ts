import { createHash } from 'node:crypto'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/utils/crypto'
import { peekUsage, tryReserve } from './quota'

export interface PooledToken {
	id: number
	label: string
	tail: string
	value: string
}

const CACHE_TTL_MS = 15_000

let cache: { at: number; tokens: PooledToken[] } | null = null
let roundRobin = 0

function hashToken(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

export function tailOf(value: string): string {
	return value.slice(-6)
}

export async function listTokens(): Promise<PooledToken[]> {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.tokens
	const rows = await prisma.scApiToken.findMany({
		where: { enabled: true },
		orderBy: { id: 'asc' },
	})
	const tokens = rows.map((r) => ({
		id: r.id,
		label: r.label,
		tail: r.token_tail,
		value: decryptSecret(r.token_encrypted),
	}))
	cache = { at: Date.now(), tokens }
	return tokens
}

export function invalidateTokenCache(): void {
	cache = null
}

/**
 * One-time seed: import legacy env.EXBO_TOKEN into the pool
 * when the table is empty. Keeps old deploys working.
 */
export async function ensureSeeded(): Promise<void> {
	if (!env.EXBO_TOKEN) return
	const count = await prisma.scApiToken.count()
	if (count > 0) return
	await storeTokens([
		{ label: 'env:EXBO_TOKEN', value: env.EXBO_TOKEN },
	]).catch(() => undefined)
}

export async function tokenUsageSnapshot(): Promise<
	{
		id: number
		label: string
		tail: string
		enabled: boolean
		used: number
		remaining: number
		reset_at: string
	}[]
> {
	const rows = await prisma.scApiToken.findMany({ orderBy: { id: 'asc' } })
	return Promise.all(
		rows.map(async (r) => ({
			id: r.id,
			label: r.label,
			tail: r.token_tail,
			enabled: r.enabled,
			...(await peekUsage(r.id)),
		}))
	)
}

export async function storeTokens(
	inputs: { label?: string; value: string }[]
): Promise<{ created: number; skipped: number }> {
	let created = 0
	let skipped = 0
	for (const input of inputs) {
		const value = input.value.trim()
		if (!value) {
			skipped++
			continue
		}
		const hash = hashToken(value)
		const existing = await prisma.scApiToken.findUnique({
			where: { token_hash: hash },
		})
		if (existing) {
			skipped++
			continue
		}
		const { encryptSecret } = await import('@/utils/crypto')
		await prisma.scApiToken.create({
			data: {
				label: input.label?.trim() || '',
				token_encrypted: encryptSecret(value),
				token_hash: hash,
				token_tail: tailOf(value),
			},
		})
		created++
	}
	invalidateTokenCache()
	return { created, skipped }
}

/**
 * Pick the next token with available quota (round-robin).
 * Reserves `cost` units atomically; exhausted tokens are skipped.
 */
export async function pickToken(
	cost: number,
	excludeIds: Set<number> = new Set()
): Promise<PooledToken | null> {
	const tokens = await listTokens()
	if (tokens.length === 0) return null
	for (let i = 0; i < tokens.length; i++) {
		roundRobin = (roundRobin + 1) % tokens.length
		const token = tokens[roundRobin]!
		if (excludeIds.has(token.id)) continue
		const reserved = await tryReserve(token.id, cost)
		if (reserved.ok) return token
		excludeIds.add(token.id)
	}
	return null
}
