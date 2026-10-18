import { Database } from 'bun:sqlite'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { gunzipSync } from 'node:zlib'
import { assetKey, MapBundle } from '../src/app/api/map3d/bundle'
import { fixture } from './map3d-fixture'

const req = (
	path: string,
	method = 'GET',
	headers?: Record<string, string>,
	body?: string
) => new Request('http://site/' + path, { method, headers, body })
test('query keys ignore cache versions and validate LOD/texture settings', () => {
	assert.equal(
		assetKey(
			'texture',
			new URL('http://x/?v=123&name=stalcraft:test&max_size=32&mip=1')
		),
		'texture?max_size=32&name=stalcraft%3Atest'
	)
	for (const url of [
		'?name=st:x.xeon',
		'?name=st:../x',
		'?name=st:x&max_size=48',
		'?name=st:x&mip=-1',
	])
		assert.throws(() => assetKey('texture', new URL('http://x/' + url)))
	assert.throws(() =>
		assetKey(
			'instances/A/terrain-lod/chunks/0/0',
			new URL('http://x/?colors=32')
		)
	)
})
test('streaming range, HEAD and conditional requests preserve exact bytes', async () => {
	const f = fixture(),
		b = new MapBundle(f.root, f.notes),
		path = 'instances/A/chunk/-2/3'
	try {
		const full = await b.handle(req(path), path),
			tag = full.headers.get('etag')!
		assert.equal(full.headers.get('content-length'), '8')
		const range = await b.handle(
			req(path, 'GET', { range: 'bytes=4-6' }),
			path
		)
		assert.equal(range.status, 206)
		assert.deepEqual(
			Array.from(new Uint8Array(await range.arrayBuffer())),
			[1, 2, 3]
		)
		assert.equal(range.headers.get('content-range'), 'bytes 4-6/8')
		const suffix = await b.handle(
			req(path, 'GET', { range: 'bytes=-2' }),
			path
		)
		assert.deepEqual(
			Array.from(new Uint8Array(await suffix.arrayBuffer())),
			[3, 4]
		)
		const head = await b.handle(req(path, 'HEAD'), path)
		assert.equal((await head.arrayBuffer()).byteLength, 0)
		assert.equal(head.headers.get('content-length'), '8')
		assert.equal(
			(await b.handle(req(path, 'GET', { 'if-none-match': tag }), path))
				.status,
			304
		)
		assert.equal(
			(await b.handle(req(path, 'GET', { range: 'bytes=999-' }), path))
				.status,
			416
		)
	} finally {
		b.close()
	}
})
test('gzip surface LOD arrives unchanged', async () => {
	const f = fixture(),
		b = new MapBundle(f.root, f.notes),
		path = 'instances/A/terrain-lod/regions/-1/0'
	try {
		const r = await b.handle(
			req(path + '?step=2&revision=' + 'a'.repeat(20)),
			path
		)
		assert.equal(r.headers.get('content-encoding'), 'gzip')
		assert.deepEqual(
			new Uint8Array(gunzipSync(Buffer.from(await r.arrayBuffer()))),
			new Uint8Array(1000).fill(78)
		)
	} finally {
		b.close()
	}
})
test('snapshot open, changes and UUID definitions preserve captured map semantics', async () => {
	const f = fixture(),
		b = new MapBundle(f.root, f.notes)
	try {
		assert.equal(
			(
				await b.handle(
					req('instances/A/open', 'POST'),
					'instances/A/open'
				)
			).status,
			200
		)
		assert.deepEqual(
			await (
				await b.handle(req('x?since=1000'), 'instances/A/changes')
			).json(),
			{ version: 1000, chunks: [] }
		)
		assert.deepEqual(
			(
				await (
					await b.handle(req('x?since=1001'), 'instances/A/changes')
				).json()
			).chunks,
			[[-2, 3]]
		)
		assert.equal(
			await (
				await b.handle(req('x?id=12'), 'instances/A/object-definition')
			).json(),
			null
		)
		assert.equal(
			(
				await (
					await b.handle(
						req('x?id=12&uuid=' + 'a'.repeat(31) + '2'),
						'instances/A/object-definition'
					)
				).json()
			).definition,
			'Ёлка'
		)
	} finally {
		b.close()
	}
})
test('worker search handles Unicode, UUID and stable pagination without upstream', async () => {
	const f = fixture(),
		b = new MapBundle(f.root, f.notes)
	try {
		const path = 'instances/A/search',
			first = await (await b.handle(req('x?q=ЁЛКА&limit=1'), path)).json()
		assert.equal(first.total, 2)
		assert.equal(first.items.length, 1)
		assert.equal(first.cursor, 2)
		const next = await (
			await b.handle(req('x?q=ёлка&limit=1&cursor=2'), path)
		).json()
		assert.equal(next.items.length, 1)
		assert.equal(next.cursor, null)
		assert.equal(
			(await (await b.handle(req('x?q=' + 'b'.repeat(32)), path)).json())
				.total,
			1
		)
		assert.equal(
			(await b.handle(req('x?q=pine&cursor=999'), path)).status,
			400
		)
	} finally {
		b.close()
	}
})
test('notes persist separately and reject invalid/oversized writes', async () => {
	const f = fixture()
	let b = new MapBundle(f.root, f.notes)
	const note = {
		id:
			'a'.repeat(8) +
			'-' +
			'a'.repeat(4) +
			'-' +
			'a'.repeat(4) +
			'-' +
			'a'.repeat(4) +
			'-' +
			'a'.repeat(12),
		instance: 'A',
		kind: 'point',
		text: 'Проверка',
		x: -2,
		y: 90,
		z: 3,
	}
	try {
		assert.equal(
			(
				await b.handle(
					req('notes', 'POST', {}, JSON.stringify(note)),
					'notes'
				)
			).status,
			200
		)
		b.close()
		b = new MapBundle(f.root, f.notes)
		assert.deepEqual(await (await b.handle(req('notes'), 'notes')).json(), [
			note,
		])
		assert.equal(
			(await b.handle(req('notes', 'POST', {}, '{broken'), 'notes'))
				.status,
			400
		)
		assert.equal(
			(
				await b.handle(
					req('notes', 'POST', {}, 'x'.repeat(65537)),
					'notes'
				)
			).status,
			413
		)
		assert.equal(
			(
				await b.handle(
					req('notes/' + note.id, 'DELETE'),
					'notes/' + note.id
				)
			).status,
			204
		)
		assert.deepEqual(
			await (await b.handle(req('notes'), 'notes')).json(),
			[]
		)
	} finally {
		b.close()
	}
})
test('bundle rejects traversal including malicious indexed paths', async () => {
	const f = fixture(),
		db = new Database(join(f.root, 'map3d.sqlite'))
	db.query('UPDATE assets SET path=? WHERE key=?').run(
		'../secret',
		'instances/A/chunk/-2/3'
	)
	db.close()
	writeFileSync(join(f.root, 'secret'), 'secret')
	const b = new MapBundle(f.root, f.notes)
	try {
		for (const path of [
			'instances/A/../secret',
			'instances/%2e%2e/chunks',
			'instances/A\\secret',
		])
			assert.equal((await b.handle(req('x'), path)).status, 404)
		assert.equal(
			(await b.handle(req('x'), 'instances/A/chunk/-2/3')).status,
			503
		)
	} finally {
		b.close()
	}
})
