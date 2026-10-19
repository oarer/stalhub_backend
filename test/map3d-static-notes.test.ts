import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { handleMapAsset } from '../src/app/api/map3d/bundle'

test('static-host deployment keeps application notes without mounting any map bundle', async () => {
	const before = {
		mode: process.env.MAP3D_STATIC_MODE,
		data: process.env.MAP3D_DATA_DIR,
		notes: process.env.MAP3D_NOTES_DB,
	}
	const dir = mkdtempSync(join(tmpdir(), 'static-map-notes-'))
	process.env.MAP3D_STATIC_MODE = '1'
	process.env.MAP3D_DATA_DIR = join(dir, 'missing-map')
	process.env.MAP3D_NOTES_DB = join(dir, 'notes.sqlite')
	const note = {
		id: '12345678-1234-1234-1234-123456789abc',
		instance: 'Merged',
		kind: 'point',
		text: 'static map',
		x: 1,
		y: 2,
		z: 3,
	}
	try {
		const post = await handleMapAsset(
			new Request('http://local/notes', {
				method: 'POST',
				body: JSON.stringify(note),
			}),
			'notes'
		)
		assert.equal(post.status, 200)
		const get = await handleMapAsset(
			new Request('http://local/notes'),
			'notes'
		)
		assert.deepEqual(await get.json(), [note])
		const invalid = await handleMapAsset(
			new Request('http://local/notes', { method: 'POST', body: 'bad' }),
			'notes'
		)
		assert.equal(invalid.status, 400)
		assert.equal(
			(
				await handleMapAsset(
					new Request('http://local/materials'),
					'materials'
				)
			).status,
			404
		)
		assert.equal(
			(
				await handleMapAsset(
					new Request('http://local/notes/' + note.id, {
						method: 'DELETE',
					}),
					'notes/' + note.id
				)
			).status,
			204
		)
	} finally {
		for (const [key, value] of Object.entries({
			MAP3D_STATIC_MODE: before.mode,
			MAP3D_DATA_DIR: before.data,
			MAP3D_NOTES_DB: before.notes,
		}))
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
	}
})
