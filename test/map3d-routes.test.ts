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
	const request = (path: string, method = 'GET', body?: string) =>
		app.handle(
			new Request(`http://localhost/api/v1/map3d/${path}`, {
				method,
				...(body === undefined
					? {}
					: {
							body,
							headers: { 'content-type': 'application/json' },
						}),
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
