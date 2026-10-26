import type { BotConfig } from './config'
import type { Region } from './query'
import type { PlayerProfile } from './stats'

export class BackendError extends Error {
	constructor(
		public readonly status: number,
		message = 'Backend request failed'
	) {
		super(message)
		this.name = 'BackendError'
	}
}

export class ProfileCache {
	private readonly entries = new Map<
		string,
		{ expiresAt: number; profile: PlayerProfile }
	>()

	constructor(private readonly ttlMs: number) {}

	get(region: Region, character: string): PlayerProfile | null {
		const key = `${region}:${character.toLowerCase()}`
		const entry = this.entries.get(key)
		if (!entry || entry.expiresAt <= Date.now()) {
			this.entries.delete(key)
			return null
		}
		return entry.profile
	}

	set(region: Region, character: string, profile: PlayerProfile): void {
		this.entries.set(`${region}:${character.toLowerCase()}`, {
			expiresAt: Date.now() + this.ttlMs,
			profile,
		})
	}
}

export async function fetchProfile(
	config: Pick<BotConfig, 'backendUrl' | 'requestTimeoutMs'>,
	region: Region,
	character: string,
	fetchImpl: typeof fetch = fetch
): Promise<PlayerProfile> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs)
	try {
		const url = `${config.backendUrl}/player/${region}/${encodeURIComponent(character)}`
		const response = await fetchImpl(url, { signal: controller.signal })
		if (!response.ok)
			throw new BackendError(
				response.status,
				`Backend returned ${response.status}`
			)
		return (await response.json()) as PlayerProfile
	} catch (error) {
		if (error instanceof BackendError) throw error
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new BackendError(504, 'Backend request timed out')
		}
		throw new BackendError(502, 'Backend request failed')
	} finally {
		clearTimeout(timer)
	}
}
