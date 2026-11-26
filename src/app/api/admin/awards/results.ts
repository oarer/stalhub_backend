export type ResultNominee = {
	id: string
	votes_count: number
	manual_place: number | null
	place: number | null
}

export function computePlaces(rows: ResultNominee[]) {
	const sorted = [...rows].sort((a, b) => b.votes_count - a.votes_count)
	let previous = -1
	let place = 0
	for (const [index, row] of sorted.entries()) {
		if (row.votes_count !== previous) {
			place = index + 1
			previous = row.votes_count
		}
		row.place = row.manual_place ?? (row.votes_count === 0 ? null : place)
	}
	return sorted
}

export function qualifiesTie(rows: ResultNominee[]) {
	const active = rows.filter(
		(row) => row.votes_count > 0 && row.manual_place === null
	)
	const groups = new Map<number, ResultNominee[]>()
	for (const row of computePlaces(active)) {
		if (row.place === null) continue
		const group = groups.get(row.place) ?? []
		group.push(row)
		groups.set(row.place, group)
	}
	for (const [place, group] of groups) {
		const end = place + group.length - 1
		if (group.length > 1 && (place === 1 || (place <= 3 && end >= 3)))
			return group
	}
	return null
}
