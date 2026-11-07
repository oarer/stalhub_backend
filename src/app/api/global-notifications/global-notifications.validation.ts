export const GLOBAL_NOTIFICATION_TITLE_MAX_LENGTH = 200
export const GLOBAL_NOTIFICATION_TEXT_MAX_LENGTH = 2000
export const GLOBAL_NOTIFICATION_LINK_TEXT_MAX_LENGTH = 200
export const GLOBAL_NOTIFICATION_HREF_MAX_LENGTH = 2048
export const GLOBAL_NOTIFICATION_MAX_PARTS = 100

export type GlobalNotificationPart =
	| { type: 'text'; text: string }
	| { type: 'link'; text: string; href: string }

export type GlobalNotificationTypeInput = 'info' | 'warning' | 'danger'
export type GlobalNotificationTypeValue = 'INFO' | 'WARNING' | 'DANGER'

export interface GlobalNotificationPayload {
	title?: unknown
	type?: unknown
	content?: unknown
	is_active?: unknown
	starts_at?: unknown
	expires_at?: unknown
}

export interface ValidatedGlobalNotificationPayload {
	title?: string
	type?: GlobalNotificationTypeValue
	content?: GlobalNotificationPart[]
	is_active?: boolean
	starts_at?: Date
	expires_at?: Date | null
}

const TYPE_VALUES: Record<string, GlobalNotificationTypeValue> = {
	info: 'INFO',
	warning: 'WARNING',
	danger: 'DANGER',
	INFO: 'INFO',
	WARNING: 'WARNING',
	DANGER: 'DANGER',
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasRawHtml(value: string) {
	return /<|>/.test(value)
}

export function isSafeGlobalNotificationHref(href: string) {
	if (
		!href.trim() ||
		href !== href.trim() ||
		href.length > GLOBAL_NOTIFICATION_HREF_MAX_LENGTH ||
		/[<>]/.test(href)
	)
		return false
	if (/[\u0000-\u001f\u007f]/.test(href) || href.includes('\\')) return false
	if (href.startsWith('//')) return false

	if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
		try {
			const url = new URL(href)
			return (
				(url.protocol === 'http:' || url.protocol === 'https:') &&
				url.hostname.length > 0
			)
		} catch {
			return false
		}
	}

	return true
}

function validateContent(value: unknown): GlobalNotificationPart[] | string {
	if (!Array.isArray(value)) return 'content must be an array'
	if (value.length < 1 || value.length > GLOBAL_NOTIFICATION_MAX_PARTS) {
		return `content must contain 1-${GLOBAL_NOTIFICATION_MAX_PARTS} parts`
	}

	const result: GlobalNotificationPart[] = []
	for (const [index, part] of value.entries()) {
		if (!isRecord(part) || typeof part.type !== 'string') {
			return `content[${index}] has an invalid shape`
		}

		if (part.type === 'text') {
			if (
				Object.keys(part).some(
					(key) => key !== 'type' && key !== 'text'
				) ||
				typeof part.text !== 'string' ||
				part.text.length < 1 ||
				part.text.length > GLOBAL_NOTIFICATION_TEXT_MAX_LENGTH ||
				hasRawHtml(part.text)
			) {
				return `content[${index}] has invalid text`
			}
			result.push({ type: 'text', text: part.text })
			continue
		}

		if (part.type === 'link') {
			if (
				Object.keys(part).some(
					(key) => !['type', 'text', 'href'].includes(key)
				) ||
				typeof part.text !== 'string' ||
				part.text.length < 1 ||
				part.text.length > GLOBAL_NOTIFICATION_LINK_TEXT_MAX_LENGTH ||
				hasRawHtml(part.text) ||
				typeof part.href !== 'string' ||
				!isSafeGlobalNotificationHref(part.href)
			) {
				return `content[${index}] has invalid link`
			}
			result.push({ type: 'link', text: part.text, href: part.href })
			continue
		}

		return `content[${index}] must be a text or link part`
	}

	return result
}

function parseIsoDate(value: unknown, field: string): Date | string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
		return `${field} must be an ISO date-time string`
	}
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? `${field} is invalid` : date
}

export function validateGlobalNotificationPayload(
	input: unknown,
	options: { partial?: boolean } = {}
): { data?: ValidatedGlobalNotificationPayload; error?: string } {
	if (!isRecord(input)) return { error: 'body must be an object' }

	const partial = options.partial ?? false
	const data: ValidatedGlobalNotificationPayload = {}

	if (!partial || input.title !== undefined) {
		if (
			typeof input.title !== 'string' ||
			input.title.trim().length < 1 ||
			input.title.length > GLOBAL_NOTIFICATION_TITLE_MAX_LENGTH ||
			hasRawHtml(input.title)
		) {
			return { error: 'title must be a non-empty string without HTML' }
		}
		data.title = input.title
	}

	if (!partial || input.type !== undefined) {
		if (typeof input.type !== 'string' || !TYPE_VALUES[input.type]) {
			return { error: 'type must be info, warning, or danger' }
		}
		data.type = TYPE_VALUES[input.type]
	}

	if (!partial || input.content !== undefined) {
		const content = validateContent(input.content)
		if (typeof content === 'string') return { error: content }
		data.content = content
	}

	if (input.is_active !== undefined) {
		if (typeof input.is_active !== 'boolean') {
			return { error: 'is_active must be a boolean' }
		}
		data.is_active = input.is_active
	}

	if (!partial || input.starts_at !== undefined) {
		if (input.starts_at === undefined) {
			if (!partial) data.starts_at = new Date()
		} else {
			const starts_at = parseIsoDate(input.starts_at, 'starts_at')
			if (typeof starts_at === 'string') return { error: starts_at }
			data.starts_at = starts_at
		}
	}

	if (input.expires_at !== undefined) {
		if (input.expires_at === null) {
			data.expires_at = null
		} else {
			const expires_at = parseIsoDate(input.expires_at, 'expires_at')
			if (typeof expires_at === 'string') return { error: expires_at }
			data.expires_at = expires_at
		}
	}

	if (data.starts_at && data.expires_at && data.expires_at < data.starts_at) {
		return {
			error: 'expires_at must be greater than or equal to starts_at',
		}
	}

	if (partial && Object.keys(data).length === 0) {
		return { error: 'at least one field is required' }
	}

	return { data }
}

export function validateGlobalNotificationDateRange(
	starts_at: Date,
	expires_at: Date | null
) {
	return expires_at === null || expires_at >= starts_at
}
