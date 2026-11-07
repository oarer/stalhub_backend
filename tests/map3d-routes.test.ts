import assert from 'node:assert/strict'
import { test } from 'node:test'
import { map3dRoutes } from '../src/app/api/map3d/index'
import { createElysia } from '../src/utils/elysia'
import { fixture } from './map3d-fixture'

test('existing Stalhub backend serves prepared maps with no upstream service', async () => {
	const f = fixture(),
		old = process.env.MAP3D_DATA_DIR
	process.env.MAP3D_DATA_DIR = f.root
	process.env.MAP3D_NOTES_DB = f.notes
	const app = createElysia({ prefix: '/api/v1' }).use(map3dRoutes)
	const access = process.env.MAP3D_ACCESS_KEY
	const request = (path: string, method = 'GET', body?: string) =>
		app.handle(
			new Request(`http://localhost/api/v1/map3d/${path}`, {
				method,
				headers: {
					...(access ? { 'x-stalhub-map-key': access } : {}),
					...(body === undefined
						? {}
						: { 'content-type': 'application/json' }),
				},
				...(body === undefined ? {} : { body }),
			})
		)
	try {
		assert.deepEqual(await (await request('instances/A/chunks')).json(), [
			[-2, 3],
		])
		assert.equal(
			(await request('instances/A/open', 'POST', '')).status,
			200
		)
		assert.deepEqual(
			Array.from(
				new Uint8Array(
					await (
						await request('instances/A/chunk/-2/3')
					).arrayBuffer()
				)
			),
			[83, 90, 67, 49, 1, 2, 3, 4]
		)
		assert.equal((await request('uploads/private')).status, 404)
		assert.equal(
			(await request('instances/A/chunks', 'DELETE')).status,
			405
		)
		assert.equal((await request('health')).status, 200)
	} finally {
		if (old === undefined) delete process.env.MAP3D_DATA_DIR
		else process.env.MAP3D_DATA_DIR = old
		delete process.env.MAP3D_NOTES_DB
	}
})

test('map API requires the proxy access key when configured', async () => {
	const previous = process.env.MAP3D_ACCESS_KEY
	process.env.MAP3D_ACCESS_KEY = 'test-map-key'
	const app = createElysia({ prefix: '/api/v1' }).use(map3dRoutes)
	try {
		assert.equal(
			(
				await app.handle(
					new Request('http://localhost/api/v1/map3d/health')
				)
			).status,
			403
		)
		assert.notEqual(
			(
				await app.handle(
					new Request('http://localhost/api/v1/map3d/health', {
						headers: { 'x-stalhub-map-key': 'test-map-key' },
					})
				)
			).status,
			403
		)
	} finally {
		if (previous === undefined) delete process.env.MAP3D_ACCESS_KEY
		else process.env.MAP3D_ACCESS_KEY = previous
	}
})
