import type { Client } from 'discord.js'
import { error } from './logger'

export const GATEWAY_CLOSE_REASONS: Record<number, string> = {
	4000: 'Unknown gateway error',
	4001: 'Unknown opcode',
	4002: 'Decode error',
	4003: 'Not authenticated',
	4004: 'Authentication failed (token is invalid or was revoked)',
	4005: 'Already authenticated',
	4006: 'Invalid sequence',
	4007: 'Gateway is rate limiting the connection',
	4008: 'Session timed out',
	4009: 'Session timed out (another client is probably connected with the same token)',
	4010: 'Invalid shard',
	4011: 'Sharding required',
	4012: 'Invalid API version',
	4013: 'Invalid intent(s)',
	4014: 'Disallowed intent(s) (enable the privileged intents in the Developer Portal)',
}

const FATAL_CLOSE_CODES = new Set([4003, 4004, 4012, 4013, 4014])

interface GatewayClose {
	code: number
	reason?: string
}

export function describeClose(close: GatewayClose): string {
	const base = GATEWAY_CLOSE_REASONS[close.code]
	const suffix = close.reason ? ` (${close.reason})` : ''
	return base ? `${base}${suffix}` : `Unknown gateway close code ${close.code}`
}

export function isFatalCloseCode(code: number): boolean {
	return FATAL_CLOSE_CODES.has(code)
}

export function fatalExit(client: Client, msg: string, delayMs = 60_000): void {
	error(msg)
	error(
		`Exiting in ${Math.round(delayMs / 1000)}s to avoid hammering the Discord gateway.`
	)
	client.destroy().catch(() => {})
	setTimeout(() => process.exit(1), delayMs)
}
