/** Read-only real-data and compiled-worker check; not a second production server. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { MapBundle } from '../src/app/api/map3d/bundle'
import { map3dRoutes } from '../src/app/api/map3d/index'
import { forwardMapAsset } from '../src/app/api/map3d/transport'
import { createElysia } from '../src/utils/elysia'

const root = process.argv[2]
if (!root) throw Error('Pass the prepared bundle directory')
process.env.MAP3D_DATA_DIR = root
const bundle = new MapBundle(root, root + '/unused-smoke-notes.sqlite')
const app = createElysia({ prefix: '/api/v1' })
	.use(map3dRoutes)
	.listen({ hostname: '127.0.0.1', port: 0 })
let checked = 0
try {
	const keys = ['materials', 'shapes', 'instances', 'maps', 'texture-version']
	for (const prefix of [
		'instances/%/chunk/%',
		'instances/%/objects-raw/%',
		'instances/%/objects/%',
		'instances/%/sr-materials',
		'instances/%/effect-bindings',
		'model-raw?%',
		'model-material?%',
		'model-texture?max_size=32&%',
		'texture?max_size=32&%',
		'sr-texture-hd?max_size=128&%',
		'instances/%/terrain-lod/regions/%?revision=%',
		'effect-resource/%.efkefc',
		'effect-resource/%.dds',
	]) {
		const row = bundle.db
			.query(
				'SELECT key FROM assets WHERE key LIKE ? ORDER BY key LIMIT 1'
			)
			.get(prefix) as { key: string } | null
		if (row) keys.push(row.key)
	}
	for (const key of keys) {
		const row = bundle.db
			.query('SELECT sha256,encoding FROM assets WHERE key=?')
			.get(key) as { sha256: string; encoding: string }
		assert.ok(row, 'Missing ' + key)
		const resource = key.split('?')[0]
		const response = await bundle.handle(
			new Request('http://local/' + key),
			resource
		)
		assert.equal(response.status, 200, key)
		const raw = Buffer.from(await response.arrayBuffer())
		assert.equal(
			createHash('sha256').update(raw).digest('hex'),
			row.sha256,
			key
		)
		const proxied = await forwardMapAsset(
			new Request('http://site/api/map3d/' + key),
			resource,
			`http://127.0.0.1:${app.server!.port}/api/v1/map3d`
		)
		assert.equal(proxied.status, 200, key)
		assert.deepEqual(
			Buffer.from(await proxied.arrayBuffer()),
			row.encoding === 'gzip' ? gunzipSync(raw) : raw,
			key
		)
		checked++
	}
	const slug = (
		bundle.db
			.query(
				'SELECT slug FROM instances WHERE EXISTS(SELECT 1 FROM objects WHERE objects.slug=instances.slug) LIMIT 1'
			)
			.get() as { slug: string }
	).slug
	const search = await bundle.handle(
		new Request(`http://local/?q=tree&limit=3`),
		`instances/${slug}/search`
	)
	assert.equal(search.status, 200)
	const page = (await search.json()) as {
		indexed_objects: number
		items: unknown[]
	}
	assert.ok(page.indexed_objects > 0)
	assert.ok(page.items.length <= 3)
	console.log(
		JSON.stringify({
			ok: true,
			revision: bundle.revision,
			checked,
			workerIndexedObjects: page.indexed_objects,
		})
	)
} finally {
	bundle.close()
	await app.stop(true)
}
