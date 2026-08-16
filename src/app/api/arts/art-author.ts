export type ArtAuthorPayload = {
	id: number | null
	name: string
	username: string
	social_links: Record<string, string> | null
}

export type ArtAuthorSource = {
	author: {
		id: number
		name: string
		username: string
		social_links: unknown
	} | null
	author_name: string | null
	author_social_links: unknown
}

export function resolveArtAuthor(art: ArtAuthorSource): ArtAuthorPayload {
	if (art.author) {
		return {
			id: art.author.id,
			name: art.author.name || art.author.username,
			username: art.author.username,
			social_links:
				(art.author.social_links as Record<string, string> | null) ??
				null,
		}
	}

	return {
		id: null,
		name: art.author_name ?? 'Unknown',
		username: '',
		social_links:
			(art.author_social_links as Record<string, string> | null) ?? null,
	}
}
