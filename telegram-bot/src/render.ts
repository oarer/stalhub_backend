export type RenderConfig = {
	imageServiceUrl: string
	requestTimeoutMs: number
	fetchImpl?: typeof fetch
}

export type RenderSvg = (svg: string) => Promise<Uint8Array<ArrayBuffer>>

export class RenderError extends Error {
	constructor(
		public readonly status: number,
		message = 'Image render failed'
	) {
		super(message)
		this.name = 'RenderError'
	}
}

export async function renderSvgPng(
	config: RenderConfig,
	svg: string
): Promise<Uint8Array<ArrayBuffer>> {
	const fetchImpl = config.fetchImpl ?? fetch
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs)
	try {
		const response = await fetchImpl(
			`${config.imageServiceUrl.replace(/\/$/, '')}/svg-to-png`,
			{
				method: 'POST',
				signal: controller.signal,
				headers: { 'content-type': 'image/svg+xml' },
				body: svg,
			}
		)
		if (!response.ok) {
			throw new RenderError(response.status, `Render ${response.status}`)
		}
		const data = new Uint8Array(await response.arrayBuffer())
		if (data.length === 0)
			throw new RenderError(502, 'Render returned no data')
		return data
	} catch (error) {
		if (error instanceof RenderError) throw error
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new RenderError(504, 'Render timed out')
		}
		throw new RenderError(502, 'Render request failed')
	} finally {
		clearTimeout(timer)
	}
}
