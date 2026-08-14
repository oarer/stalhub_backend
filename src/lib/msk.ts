export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

export function mskDate(d: Date = new Date()): string {
	return new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10)
}

export function mskNow(): Date {
	return new Date(Date.now() + MSK_OFFSET_MS)
}

export function mskHour(): number {
	return mskNow().getUTCHours()
}

export function isBeforeMskHour(hour: number): boolean {
	return mskHour() < hour
}
