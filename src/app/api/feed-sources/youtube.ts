import { XMLParser } from 'fast-xml-parser'
import { parseFeedIcon } from '@/app/api/feed-sources/icon'
import { buildFeedSourceUrl } from '@/app/api/feed-sources/url'
import { postsService } from '@/app/api/posts/posts.service'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'

const parser = new XMLParser({
	removeNSPrefix: true,
	trimValues: true,
})

type YouTubeEntry = {
	videoId?: string
	title?: string
	published?: string
	author?: { name?: string }
	group?: { description?: string }
}

type YouTubeFeed = {
	title?: string
	author?: { name?: string }
	entry?: YouTubeEntry | YouTubeEntry[]
}

type ParsedEntry = YouTubeEntry & { publishedDate: Date }

function asEntries(value: YouTubeEntry | YouTubeEntry[] | undefined) {
	return value ? (Array.isArray(value) ? value : [value]) : []
}

async function fetchRssHubIcon(externalId: string): Promise<string | null> {
	const baseUrl = env.RSSHUB_BASE_URL.replace(/\/$/, '')
	try {
		const response = await fetch(
			`${baseUrl}/youtube/channel/${encodeURIComponent(externalId)}?format=json`,
			{ signal: AbortSignal.timeout(15_000) }
		)
		if (!response.ok) return null
		return parseFeedIcon(await response.json())
	} catch {
		return null
	}
}

export async function syncYouTubeSources(
	sourceIds?: number[]
): Promise<{ synced: number; errors: string[] }> {
	const sources = await prisma.feedSource.findMany({
		where: {
			type: 'YOUTUBE',
			enabled: true,
			...(sourceIds ? { id: { in: sourceIds } } : {}),
		},
		orderBy: { id: 'asc' },
	})
	let synced = 0
	const errors: string[] = []

	for (const source of sources) {
		try {
			const [response, avatarUrl] = await Promise.all([
				fetch(
					`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(source.external_id)}`,
					{ signal: AbortSignal.timeout(15_000) }
				),
				fetchRssHubIcon(source.external_id),
			])
			if (!response.ok)
				throw new Error(
					`RSS request failed with HTTP ${response.status}`
				)
			const xml = await response.text()
			const feed = (parser.parse(xml) as { feed?: YouTubeFeed }).feed
			if (!feed) throw new Error('RSS response did not contain a feed')

			const entries = asEntries(feed.entry)
				.map((entry) => ({
					...entry,
					publishedDate: entry.published
						? new Date(entry.published)
						: null,
				}))
				.filter(
					(entry): entry is ParsedEntry =>
						!!entry.videoId &&
						!!entry.title &&
						entry.publishedDate !== null &&
						!Number.isNaN(entry.publishedDate.getTime())
				)
				.sort(
					(a, b) =>
						a.publishedDate.getTime() - b.publishedDate.getTime()
				)

			const newestPublished = entries.length
				? entries[entries.length - 1].publishedDate
				: new Date()
			const sourceUrl = buildFeedSourceUrl('YOUTUBE', source.external_id)
			const lastSyncedAt = source.last_synced_at
			if (lastSyncedAt) {
				const authorName =
					feed.author?.name ||
					entries[0]?.author?.name ||
					source.label
				for (const entry of entries) {
					if (entry.publishedDate <= lastSyncedAt) continue
					const description = entry.group?.description?.trim()
					const videoId = entry.videoId as string
					const title = entry.title as string
					const content = [
						title,
						'',
						`https://www.youtube.com/watch?v=${videoId}`,
						...(description ? ['', description] : []),
					].join('\n')
					const result = await postsService.createIngest({
						source: 'YOUTUBE',
						external_key: `yt:${videoId}`,
						content,
						image_urls: [
							`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
						],
						author_name: authorName,
						source_url: sourceUrl,
						source_avatar_url: avatarUrl,
						feed_source_id: source.id,
					})
					if (result.created) synced += 1
				}
			}
			await prisma.post.updateMany({
				where: {
					source: 'YOUTUBE',
					source_url: sourceUrl,
				},
				data: {
					feed_source_id: source.id,
					...(avatarUrl ? { source_avatar_url: avatarUrl } : {}),
				},
			})
			await prisma.feedSource.update({
				where: { id: source.id },
				data: { last_synced_at: newestPublished },
			})
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown error'
			errors.push(`Feed source ${source.id}: ${message}`)
		}
	}

	return { synced, errors }
}
