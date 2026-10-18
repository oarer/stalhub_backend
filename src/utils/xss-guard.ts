import { DiscordEmbedColors, notifyAdmins } from '@/utils/auto-ban/notify'

const XSS_PATTERNS: { name: string; re: RegExp }[] = [
	{ name: 'script-tag', re: /<\s*\/?\s*script\b/i },
	{ name: 'event-handler', re: /\bon\w+\s*=\s*["']?[^"'>]+/i },
	{ name: 'javascript-uri', re: /javascript\s*:/i },
	{ name: 'data-uri', re: /data\s*:\s*text\/html/i },
	{ name: 'vbscript-uri', re: /vbscript\s*:/i },
	{
		name: 'iframe-object-embed',
		re: /<\s*(iframe|object|embed|form|base|meta)\b/i,
	},
	{ name: 'svg-onload', re: /<\s*svg[^>]*\bon\w+\s*=/i },
	{ name: 'expression-css', re: /expression\s*\(/i },
]

const MAX_SAMPLE = 200

export function findXssThreat(value: string): string | null {
	for (const { name, re } of XSS_PATTERNS) {
		if (re.test(value)) return name
	}

	const decoded = value
		.replace(/&#x([0-9a-f]+);?/gi, (_, h) =>
			String.fromCharCode(parseInt(h, 16))
		)
		.replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
	if (decoded !== value) {
		for (const { name, re } of XSS_PATTERNS) {
			if (re.test(decoded)) return `${name} (encoded)`
		}
	}
	return null
}

export type XssScanResult = {
	field: string
	pattern: string
	sample: string
} | null

function isScannable(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0
}

export function scanXss(fields: Record<string, unknown>): XssScanResult {
	for (const [field, raw] of Object.entries(fields)) {
		if (!isScannable(raw)) continue
		const pattern = findXssThreat(raw)
		if (pattern) {
			return {
				field,
				pattern,
				sample: raw.slice(0, MAX_SAMPLE),
			}
		}
	}
	return null
}

export async function rejectOnXss(opts: {
	fields: Record<string, unknown>
	user_id?: number
	ip?: string
	route?: string
}): Promise<XssScanResult> {
	const hit = scanXss(opts.fields)
	if (!hit) return null
	void notifyAdmins({
		title: 'XSS attempt blocked',
		description: `Поле \`${hit.field}\` отклонено (паттерн \`${hit.pattern}\`).`,
		color: DiscordEmbedColors.warn,
		fields: [
			{
				name: 'User ID',
				value: String(opts.user_id ?? '?'),
				inline: true,
			},
			{ name: 'IP', value: opts.ip ?? '?', inline: true },
			{ name: 'Route', value: opts.route ?? '?', inline: true },
			{ name: 'Field', value: hit.field, inline: true },
			{ name: 'Pattern', value: hit.pattern, inline: true },
			{ name: 'Sample', value: hit.sample.slice(0, 500) || '(empty)' },
		],
	})
	return hit
}

export function isSafeUrl(value: string): boolean {
	const v = value.trim()
	if (!v) return false
	if (/^(javascript|data|vbscript|blob|file)\s*:/i.test(v)) return false
	if (v.startsWith('/uploads/')) {
		return (
			!v.includes('..') &&
			!v.includes('\\') &&
			!v.includes('\0') &&
			/^\/uploads\/[A-Za-z0-9\-_/]+\.[A-Za-z0-9]{2,5}$/.test(
				v.split('?')[0] ?? ''
			)
		)
	}
	try {
		const u = new URL(v)
		return u.protocol === 'http:' || u.protocol === 'https:'
	} catch {
		return false
	}
}
