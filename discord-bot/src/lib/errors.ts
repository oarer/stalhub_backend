export class HttpError extends Error {
	constructor(
		public status: number,
		public body: {
			error?: string
			required?: string[]
			detected?: unknown
		} | null
	) {
		super(body?.error ?? `HTTP ${status}`)
		this.name = 'HttpError'
	}
}

export function errMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err)
}
