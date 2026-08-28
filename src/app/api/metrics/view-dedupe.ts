import { createHash } from 'node:crypto'
import { redis } from 'bun'

const VIEW_TTL_SECONDS = 12 * 60 * 60

type ViewIdentity = {
	userId?: number
	ip?: string
	userAgent?: string
}

function viewerKey(identity: ViewIdentity): string | null {
	if (Number.isInteger(identity.userId) && (identity.userId ?? 0) > 0) {
		return `user:${identity.userId}`
	}
	const ip = identity.ip?.trim()
	const userAgent = identity.userAgent?.trim()
	if (!ip) return null
	return `anon:${createHash('sha256')
		.update(`${ip ?? ''}\n${userAgent ?? ''}`)
		.digest('hex')}`
}

export async function recordContentView(
	contentType: 'ARTICLE' | 'ART' | 'TIER_LIST',
	contentId: number,
	identity: ViewIdentity
): Promise<boolean> {
	const key = viewerKey(identity)
	if (!key || !Number.isInteger(contentId) || contentId <= 0) return false

	try {
		return (
			(await redis.set(
				`content-view:${contentType}:${contentId}:${key}`,
				'1',
				'NX',
				'EX',
				VIEW_TTL_SECONDS.toString()
			)) === 'OK'
		)
	} catch (error) {
		console.error('[Metrics] Failed to record content view:', error)
		return false
	}
}

export type { ViewIdentity }
