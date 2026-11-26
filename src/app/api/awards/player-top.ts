/**
 * Nickname helpers for the "Player of the year" award category (RU).
 *
 * Names are validated locally before they are resolved against the eAPI, so a
 * malformed query never reaches the upstream. `topPlayerNominees` returns the
 * most voted nominees in a shuffled order: places and vote counts stay hidden
 * before the campaign is published.
 */
const PLAYER_NAME_MAX_LENGTH = 64
const PLAYER_NAME_RE = /^[\p{L}\p{N}_.\- ]{1,64}$/u

export function normalizePlayerName(value: string): string | null {
	const normalized = value.trim().replace(/\s+/g, ' ')
	if (
		normalized.length === 0 ||
		normalized.length > PLAYER_NAME_MAX_LENGTH ||
		!PLAYER_NAME_RE.test(normalized)
	)
		return null
	return normalized
}

export function normalizePlayerQuery(value: string): string | null {
	const normalized = value.trim().replace(/\s+/g, ' ')
	if (normalized.length < 2 || normalized.length > PLAYER_NAME_MAX_LENGTH)
		return null
	return normalized
}

export interface RankedPlayer {
	id: string
	votes: number
}

export function topPlayerNominees<T extends RankedPlayer>(
	items: T[],
	limit: number,
	random: () => number = Math.random
): T[] {
	const top = [...items]
		.sort((left, right) => right.votes - left.votes)
		.slice(0, Math.max(0, limit))
	for (let index = top.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		;[top[index], top[swap]] = [top[swap]!, top[index]!]
	}
	return top
}
