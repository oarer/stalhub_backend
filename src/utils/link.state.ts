const linkState = new Map<string, { userId: string; expiresAt: number }>()

export function createLinkState(userId: string): string {
	const state = crypto.randomUUID()
	linkState.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 })
	return state
}

export function consumeLinkState(state: string): string | null {
	const entry = linkState.get(state)
	if (!entry || entry.expiresAt < Date.now()) return null
	linkState.delete(state)
	return entry.userId
}
