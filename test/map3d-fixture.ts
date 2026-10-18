import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { assetKey } from '../src/app/api/map3d/bundle'
export function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'stalhub-map3d-'))
	mkdirSync(join(root, 'packs'))
	const db = new Database(join(root, 'map3d.sqlite'))
	db.exec(
		readFileSync(new URL('./map3d-schema.sql', import.meta.url), 'utf8')
	)
	for (const [k, v] of [
		['schema', '1'],
		['revision', 'a'.repeat(20)],
		['version', '1000'],
	])
		db.query('INSERT INTO meta VALUES(?,?)').run(k, v)
	db.query('INSERT INTO instances VALUES(?,?,?)').run(
		'A',
		JSON.stringify({
			known: 1,
			indexed: 1,
			version: 1000,
			indexing: false,
		}),
		'[[-2,3]]'
	)
	let offset = 0
	const buffers: Uint8Array[] = []
	const put = (
		key: string,
		data: Uint8Array,
		mime = 'application/octet-stream',
		encoding = ''
	) => {
		buffers.push(data)
		db.query('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)').run(
			key,
			'packs/data.bin',
			offset,
			data.byteLength,
			createHash('sha256').update(data).digest('hex'),
			mime,
			encoding,
			'no-cache'
		)
		offset += data.length
	}
	put(
		'instances',
		new TextEncoder().encode('[{"slug":"A","chunks":1}]'),
		'application/json'
	)
	put(
		'instances/A/chunks',
		new TextEncoder().encode('[[-2,3]]'),
		'application/json'
	)
	put('instances/A/chunk/-2/3', new Uint8Array([83, 90, 67, 49, 1, 2, 3, 4]))
	put(
		assetKey(
			'texture',
			new URL('http://x/?name=stalcraft:test&max_size=32')
		),
		new Uint8Array([32, 1, 2])
	)
	put(
		'instances/A/terrain-lod/regions/-1/0',
		new Uint8Array([83, 67, 76, 54])
	)
	put(
		assetKey(
			'instances/A/terrain-lod/regions/-1/0',
			new URL('http://x/?step=2&revision=' + 'a'.repeat(20))
		),
		gzipSync(new Uint8Array(1000).fill(78)),
		'application/octet-stream',
		'gzip'
	)
	for (let i = 0; i < 3; i++) {
		const metadata = {
			object_id_u16: String(10 + i),
			definition: i === 1 ? 'Триггер' : 'Ёлка',
			uuid_hex: i === 1 ? 'b'.repeat(32) : 'a'.repeat(31) + i,
			model_mcsb: i === 1 ? 'props:zone.mcsb' : 'plants:pine.mcsb',
		}
		db.query('INSERT INTO documents VALUES(?,?)').run(
			i + 1,
			JSON.stringify(metadata).toLowerCase()
		)
		db.query('INSERT INTO objects VALUES(?,?,?,?,?,?,?,?)').run(
			'A',
			i,
			-2,
			3,
			metadata.uuid_hex,
			String(10 + i),
			i + 1,
			JSON.stringify(metadata)
		)
		db.query('INSERT INTO definitions VALUES(?,?,?,?)').run(
			'A',
			String(10 + i),
			JSON.stringify(metadata),
			i === 2 ? 1 : 0
		)
	}
	db.close()
	writeFileSync(join(root, 'packs/data.bin'), Buffer.concat(buffers))
	return { root, notes: join(root, 'notes.sqlite') }
}
