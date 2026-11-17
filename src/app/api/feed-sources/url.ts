export type FeedSourceType = 'TG' | 'YOUTUBE'

export function telegramChannelUrlFromMessage(
	messageUrl: string | undefined
): string | null {
	if (!messageUrl) return null
	try {
		const parsed = new URL(messageUrl)
		if (!/(^|\.)t\.me$/i.test(parsed.hostname)) return null
		const parts = parsed.pathname.split('/').filter(Boolean)
		if (parts[0] === 's') parts.shift()
		if (parts[0] === 'c') {
			const channel = parts[1]
			return channel ? `https://t.me/c/${channel}` : null
		}
		const channel = parts[0]
		if (!channel || !/^[A-Za-z0-9_]{4,64}$/.test(channel)) return null
		return `https://t.me/${channel}`
	} catch {
		return null
	}
}

export function buildFeedSourceUrl(
	type: FeedSourceType,
	externalId: string,
	messageUrl?: string
): string | null {
	if (type === 'YOUTUBE') {
		return `https://www.youtube.com/channel/${externalId}`
	}
	return (
		telegramChannelUrlFromMessage(messageUrl) ??
		telegramChannelUrlFromMessage(`https://t.me/${externalId}`)
	)
}
