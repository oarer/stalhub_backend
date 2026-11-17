type Entry<T> = { value: T; expiresAt: number }

export class SessionStore<T> {
	private readonly entries = new Map<string, Entry<T>>()

	public constructor(
		private readonly ttlMs: number,
		private readonly now: () => number = Date.now
	) {}

	set(key: string, value: T): void {
		this.prune()
		this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
	}

	get(key: string): T | null {
		const entry = this.entries.get(key)
		if (!entry) return null
		if (entry.expiresAt <= this.now()) {
			this.entries.delete(key)
			return null
		}
		return entry.value
	}

	private prune(): void {
		const now = this.now()
		for (const [key, entry] of this.entries) {
			if (entry.expiresAt <= now) this.entries.delete(key)
		}
	}
}

export function shortHash(value: string): string {
	let hash = 2_166_136_261
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0
		hash = Math.imul(hash, 16_777_619) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

export function profileSessionKey(region: string, username: string): string {
	return shortHash(`${region}:${username.toLowerCase()}`)
}
