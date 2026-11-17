export class RateLimiter {
	private readonly requests = new Map<number, number[]>()

	constructor(
		private readonly limit: number,
		private readonly windowMs = 60_000
	) {}

	allow(userId: number): boolean {
		const now = Date.now()
		const recent = (this.requests.get(userId) ?? []).filter(
			(timestamp) => timestamp > now - this.windowMs
		)
		if (recent.length >= this.limit) {
			this.requests.set(userId, recent)
			return false
		}
		recent.push(now)
		this.requests.set(userId, recent)
		return true
	}
}
