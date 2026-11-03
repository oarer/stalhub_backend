export const UNO_MAX_URL_LENGTH = 4096

const STALHUB_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*stalhub\.dev$/

function originOf(url: string | undefined): string | null {
	if (!url) return null
	try {
		const value = new URL(url)
		return `${value.protocol}//${value.host}`
	} catch {
		return null
	}
}

export function isAllowedUnoOrigin(
	value: string | null,
	allowedOrigins: readonly string[]
): boolean {
	const origin = originOf(value ?? undefined)
	return (
		origin !== null &&
		(allowedOrigins.includes(origin) || STALHUB_ORIGIN_RE.test(origin))
	)
}

export function isAllowedUnoRequest(
	request: Request,
	allowedOrigins: readonly string[]
): boolean {
	const origin = request.headers.get('origin')
	if (origin) return isAllowedUnoOrigin(origin, allowedOrigins)

	const referer = request.headers.get('referer')
	if (referer) return isAllowedUnoOrigin(referer, allowedOrigins)

	return true
}
