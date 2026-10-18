import { Database } from 'bun:sqlite'

let db: Database | undefined,
	path = ''
self.onmessage = (e) => {
	const { id, db: location, slug, q, limit, cursor } = e.data
	try {
		if (!db || path !== location) {
			db?.close()
			db = new Database(location, { readonly: true })
			path = location
		}
		const count = (
			db
				.query('SELECT count(*) AS n FROM objects WHERE slug=?')
				.get(slug) as {
				n: number
			}
		).n
		if (cursor > count) throw Error('Invalid search cursor')
		const uuid = q.replaceAll('-', ''),
			uuidNeedle = /^[a-f\d]{4,32}$/.test(uuid) ? uuid : ''
		const predicate =
			"o.slug=? AND (o.doc IN (SELECT id FROM documents WHERE instr(search,?)>0) OR (?!='' AND instr(o.uuid,?)>0))"
		const total = (
			db
				.query(`SELECT count(*) AS n FROM objects o WHERE ${predicate}`)
				.get(slug, q, uuidNeedle, uuidNeedle) as { n: number }
		).n
		const rows = db
			.query(
				`SELECT seq,cx,cz,metadata FROM objects o WHERE ${predicate} AND seq>=? ORDER BY seq LIMIT ?`
			)
			.all(slug, q, uuidNeedle, uuidNeedle, cursor, limit + 1) as {
			seq: number
			cx: number
			cz: number
			metadata: string
		}[]
		const next = rows.length > limit ? rows.pop()!.seq : null
		self.postMessage({
			id,
			result: {
				items: rows.map((r) => ({
					cx: r.cx,
					cz: r.cz,
					metadata: JSON.parse(r.metadata),
				})),
				total,
				cursor: next,
				coverage:
					'prepared captured object metadata; XYZ may be absent',
				indexed_objects: count,
			},
		})
	} catch (e) {
		self.postMessage({ id, error: String(e) })
	}
}
