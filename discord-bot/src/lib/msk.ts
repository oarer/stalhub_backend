export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export function mskDateStr(d = new Date()): string {
	return new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10)
}

export function mskHHMM(): string {
	return new Date(Date.now() + MSK_OFFSET_MS).toISOString().slice(11, 16)
}

export function mskHour(): number {
	return Number(
		new Date(Date.now() + MSK_OFFSET_MS).toISOString().slice(11, 13)
	)
}

export function addDays(dateStr: string, days: number): string {
	const [y, m, d] = dateStr.split('-').map(Number)
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function fmtDate(dateStr: string): string {
	const [y, m, d] = dateStr.split('-').map(Number)
	const dt = new Date(Date.UTC(y, m - 1, d))
	return `${WEEKDAYS[dt.getUTCDay()]}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`
}
