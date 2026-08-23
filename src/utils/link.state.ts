const linkState = new Map<string, { user_id: number; expiresAt: number }>()

export function createLinkState(user_id: number): string {
	const state = crypto.randomUUID()
	linkState.set(state, { user_id, expiresAt: Date.now() + 10 * 60 * 1000 })
	return state
}

export function consumeLinkState(state: string): number | null {
	const entry = linkState.get(state)
	if (!entry || entry.expiresAt < Date.now()) return null
	linkState.delete(state)
	return entry.user_id
}
