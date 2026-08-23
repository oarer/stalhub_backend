import { MSK_OFFSET_MS } from '@/lib/msk'

export type AttendanceMonthStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

interface AttendanceRow {
	name: string
	user_id: number | null
	status: AttendanceMonthStatus
	note: string | null
}

interface AttendanceSession {
	id: number
	type: string
	stage_number: number | null
	started_at: Date
	attendance: AttendanceRow[]
}

interface AttendanceAbsenceEvent {
	event_type: string
	stages?: number[]
}

interface AttendanceAbsence {
	user_id: number
	date: string
	note: string | null
	events: AttendanceAbsenceEvent[]
}

export interface AttendanceMonthInput {
	month: string
	members: Array<{ name: string; user_id: number | null }>
	sessions: AttendanceSession[]
	absences: AttendanceAbsence[]
}

export interface AttendanceMonthResponse {
	month: string
	days: Array<{
		date: string
		sessions: Array<{
			id: number
			type: string
			stage_number: number | null
		}>
	}>
	members: Array<{
		name: string
		days: Record<
			string,
			Array<{
				session_id: number
				status: AttendanceMonthStatus
				note: string | null
			}>
		>
	}>
}

export function mskMonthRange(month: string): [Date, Date] {
	if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month')
	const [year, monthNumber] = month.split('-').map(Number)
	if (monthNumber < 1 || monthNumber > 12) throw new Error('Invalid month')
	const from = Date.UTC(year, monthNumber - 1, 1) - MSK_OFFSET_MS
	const to = Date.UTC(year, monthNumber, 1) - MSK_OFFSET_MS
	return [new Date(from), new Date(to)]
}

function monthDates(month: string): string[] {
	const [year, monthNumber] = month.split('-').map(Number)
	const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
	return Array.from(
		{ length: count },
		(_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
	)
}

function mskDate(date: Date): string {
	return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10)
}

function hasMatchingAbsence(
	absence: AttendanceAbsence,
	session: AttendanceSession
): boolean {
	return absence.events.some(
		(event) =>
			event.event_type === session.type &&
			(!event.stages?.length ||
				(session.stage_number != null &&
					event.stages.includes(session.stage_number)))
	)
}

export function buildAttendanceMonth(
	input: AttendanceMonthInput
): AttendanceMonthResponse {
	const sessions = [...input.sessions].sort(
		(a, b) => a.started_at.getTime() - b.started_at.getTime() || a.id - b.id
	)
	const days = new Map<
		string,
		Array<{ id: number; type: string; stage_number: number | null }>
	>(monthDates(input.month).map((date) => [date, []]))
	const memberNames = new Map(
		input.members.map((member) => [member.name.toLowerCase(), member.name])
	)

	for (const session of sessions) {
		const date = mskDate(session.started_at)
		const entries = days.get(date) ?? []
		entries.push({
			id: session.id,
			type: session.type,
			stage_number: session.stage_number,
		})
		days.set(date, entries)
		for (const attendance of session.attendance) {
			if (!memberNames.has(attendance.name.toLowerCase())) {
				memberNames.set(attendance.name.toLowerCase(), attendance.name)
			}
		}
	}

	return {
		month: input.month,
		days: [...days.entries()].map(([date, daySessions]) => ({
			date,
			sessions: daySessions,
		})),
		members: [...memberNames.values()]
			.sort((a, b) => a.localeCompare(b, 'ru'))
			.map((name) => {
				const days: AttendanceMonthResponse['members'][number]['days'] =
					{}
				for (const session of sessions) {
					const attendance = session.attendance.find(
						(row) => row.name.toLowerCase() === name.toLowerCase()
					)
					if (!attendance) continue
					const date = mskDate(session.started_at)
					const absence =
						attendance.status === 'ABSENT' &&
						attendance.user_id != null
							? input.absences.find(
									(item) =>
										item.user_id === attendance.user_id &&
										item.date === date &&
										hasMatchingAbsence(item, session)
								)
							: undefined
					const entries = days[date] ?? []
					entries.push({
						session_id: session.id,
						status: absence ? 'EXCUSED' : attendance.status,
						note: absence?.note ?? attendance.note,
					})
					days[date] = entries
				}
				return { name, days }
			}),
	}
}
