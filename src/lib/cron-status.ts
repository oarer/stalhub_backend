export interface CronStatusEntry {
	name: string
	pattern: string
	timezone?: string
	last_run_at: string | null
	last_status: 'ok' | 'error' | 'unknown'
	last_error: string | null
	last_duration_ms: number | null
	runs: number
	failures: number
}

export const cronStatus = new Map<string, CronStatusEntry>()

export function registerCronStatus(
	name: string,
	pattern: string,
	timezone?: string
) {
	const existing = cronStatus.get(name)
	if (existing) return existing
	const entry: CronStatusEntry = {
		name,
		pattern,
		timezone,
		last_run_at: null,
		last_status: 'unknown',
		last_error: null,
		last_duration_ms: null,
		runs: 0,
		failures: 0,
	}
	cronStatus.set(name, entry)
	return entry
}

export function withTracking(
	name: string,
	pattern: string,
	timezone: string | undefined,
	run: () => Promise<void>
): () => Promise<void> {
	const entry = registerCronStatus(name, pattern, timezone)
	return async () => {
		const startedAt = Date.now()
		try {
			await run()
			entry.last_status = 'ok'
			entry.last_error = null
		} catch (err) {
			entry.last_status = 'error'
			entry.last_error = err instanceof Error ? err.message : String(err)
			entry.failures += 1
			console.error(`[Cron] ${name} failed:`, err)
		} finally {
			entry.runs += 1
			entry.last_run_at = new Date().toISOString()
			entry.last_duration_ms = Date.now() - startedAt
		}
	}
}
