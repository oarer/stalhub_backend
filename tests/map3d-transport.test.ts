import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import {
	forwardMapAsset,
	mapBackendOrigin,
} from '../src/app/api/map3d/transport'

test('website reuses its existing API address with an optional internal backend override', () => {
	const previous = process.env.STALHUB_BACKEND_URL,
		api = process.env.NEXT_PUBLIC_API
	try {
		delete process.env.STALHUB_BACKEND_URL
		delete process.env.NEXT_PUBLIC_API
		assert.equal(mapBackendOrigin(), 'http://127.0.0.1:3001/api/v1/map3d')
		process.env.NEXT_PUBLIC_API = 'https://api.site.test/'
		assert.equal(mapBackendOrigin(), 'https://api.site.test/api/v1/map3d')
		process.env.STALHUB_BACKEND_URL = 'http://app:3001/api/v1/'
		assert.equal(mapBackendOrigin(), 'http://app:3001/api/v1/map3d')
	} finally {
		if (previous === undefined) delete process.env.STALHUB_BACKEND_URL
		else process.env.STALHUB_BACKEND_URL = previous
		if (api === undefined) delete process.env.NEXT_PUBLIC_API
		else process.env.NEXT_PUBLIC_API = api
	}
})
test('upstream API mount supports another Stalhub deployment', async () => {
	let path = ''
	const server = createServer((req, res) => {
		path = req.url!
		res.end('ok')
	})
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
	try {
		const result = await forwardMapAsset(
			new Request('http://site/api/map3d/health'),
			'health',
			`http://127.0.0.1:${(server.address() as { port: number }).port}/api/map3d/`
		)
		assert.equal(await result.text(), 'ok')
		assert.equal(path, '/api/map3d/health')
	} finally {
		server.closeAllConnections()
		await new Promise<void>((r) => server.close(() => r()))
	}
})
test('gzip asset survives proxy in full, with safe headers and unchanged query', async () => {
	const payload = new Uint8Array(85024).fill(73),
		gzip = gzipSync(payload)
	let requested = ''
	const server = createServer((req, res) => {
		requested = req.url!
		res.writeHead(200, {
			'content-encoding': 'gzip',
			'content-length': gzip.length,
			'content-type': 'application/octet-stream',
			'cache-control': 'public,max-age=3600',
			etag: '"sample"',
		})
		res.end(gzip)
	})
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	const port = (server.address() as { port: number }).port
	try {
		const result = await forwardMapAsset(
			new Request(
				'http://site/api/map3d/instances/A/terrain-lod/regions/-39/10?step=2&revision=abc'
			),
			'instances/A/terrain-lod/regions/-39/10',
			`http://127.0.0.1:${port}`
		)
		assert.equal(result.status, 200)
		assert.equal(result.headers.get('content-length'), null)
		assert.equal(result.headers.get('content-encoding'), null)
		assert.equal(result.headers.get('etag'), '"sample"')
		assert.deepEqual(new Uint8Array(await result.arrayBuffer()), payload)
		assert.equal(
			requested,
			'/api/instances/A/terrain-lod/regions/-39/10?step=2&revision=abc'
		)
	} finally {
		server.closeAllConnections()
		await new Promise<void>((resolve) => server.close(() => resolve()))
	}
})
test('proxy rejects traversal, unsupported assets, and writes outside notes/open', async () => {
	for (const path of [
		'instances/A/../secret',
		'texture/../../secret',
		'instances/%2e%2e/secret',
		'uploads/x',
		'model?name=x',
		'instances//chunks',
	])
		assert.equal(
			(
				await forwardMapAsset(
					new Request('http://site/'),
					path,
					'http://127.0.0.1:1'
				)
			).status,
			404
		)
	assert.equal(
		(
			await forwardMapAsset(
				new Request('http://site/', { method: 'DELETE' }),
				'instances/A',
				'http://127.0.0.1:1'
			)
		).status,
		405
	)
	assert.equal(
		(
			await forwardMapAsset(
				new Request('http://site/', {
					method: 'POST',
					body: 'x'.repeat(65537),
				}),
				'notes',
				'http://127.0.0.1:1'
			)
		).status,
		413
	)
})

test('proxy bounds a note body while streaming before any upstream request', async () => {
	let cancelled = false,
		pulls = 0
	const body = new ReadableStream<Uint8Array>({
		pull(out) {
			pulls++
			out.enqueue(new Uint8Array(40000))
		},
		cancel() {
			cancelled = true
		},
	})
	const request = new Request('http://site/', {
		method: 'POST',
		body,
		duplex: 'half',
	} as RequestInit)
	assert.equal(
		(await forwardMapAsset(request, 'notes', 'http://127.0.0.1:1')).status,
		413
	)
	assert.equal(cancelled, true)
	assert.ok(pulls <= 3)
})
