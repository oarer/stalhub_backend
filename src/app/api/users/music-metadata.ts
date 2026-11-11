type MusicSettings = {
	music_url?: string
	music_title?: string
	music_artist?: string
	music_cover?: string
}

type OEmbedResponse = {
	title?: unknown
	author_name?: unknown
	thumbnail_url?: unknown
}

const MAX_TEXT_LENGTH = 120
const ALLOWED_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
	'open.spotify.com',
	'spotify.com',
	'www.spotify.com',
	'soundcloud.com',
	'www.soundcloud.com',
])

function asText(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const text = value.trim()
	return text ? text.slice(0, MAX_TEXT_LENGTH) : undefined
}

function isAllowedHost(url: URL) {
	return ALLOWED_HOSTS.has(url.hostname.toLowerCase())
}

function oEmbedUrl(url: URL): string | null {
	const encoded = encodeURIComponent(url.toString())
	const hostname = url.hostname.toLowerCase()

	if (
		hostname === 'youtube.com' ||
		hostname === 'www.youtube.com' ||
		hostname === 'm.youtube.com' ||
		hostname === 'music.youtube.com' ||
		hostname === 'youtu.be'
	) {
		return `https://www.youtube.com/oembed?url=${encoded}&format=json`
	}

	if (hostname === 'open.spotify.com' || hostname.endsWith('spotify.com')) {
		return `https://open.spotify.com/oembed?url=${encoded}`
	}

	if (hostname === 'soundcloud.com' || hostname === 'www.soundcloud.com') {
		return `https://soundcloud.com/oembed?format=json&url=${encoded}`
	}

	return null
}

async function fetchMetadata(url: URL) {
	const endpoint = oEmbedUrl(url)
	if (!endpoint) return null

	try {
		const response = await fetch(endpoint, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(5000),
		})
		if (!response.ok) return null

		const data = (await response.json()) as OEmbedResponse
		return {
			title: asText(data.title),
			artist: asText(data.author_name),
			cover:
				typeof data.thumbnail_url === 'string'
					? data.thumbnail_url.trim()
					: undefined,
		}
	} catch {
		return null
	}
}

export async function enrichMusicSettings(
	settings: MusicSettings
): Promise<MusicSettings> {
	const rawUrl = settings.music_url?.trim() ?? ''
	if (!rawUrl) {
		return {
			...settings,
			music_url: '',
			music_title: '',
			music_artist: '',
			music_cover: '',
		}
	}

	let url: URL
	try {
		url = new URL(rawUrl)
	} catch {
		return settings
	}

	if (!isAllowedHost(url)) return settings

	const metadata = await fetchMetadata(url)
	if (!metadata) return settings

	return {
		...settings,
		music_url: rawUrl,
		music_title: metadata.title ?? settings.music_title,
		music_artist: metadata.artist ?? settings.music_artist,
		music_cover: metadata.cover ?? settings.music_cover,
	}
}
