import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	isMapAssetPath,
	mapMetricRoute,
} from '../src/app/api/map3d/request-policy'

test('map bulk reads skip Redis request bookkeeping, search and notes keep normal limits', () => {
	for (const path of [
		'texture',
		'model-raw',
		'instances/05.09/chunk/-622/189',
		'instances/05.09/terrain-lod/regions/-39/11',
		'effect-resource/effects/smoke.png',
	])
		assert.equal(isMapAssetPath('/api/v1/map3d/' + path), true, path)
	for (const path of [
		'notes',
		'notes/uuid',
		'instances/05.09/search',
		'instances/05.09/open',
		'uploads/file',
	])
		assert.equal(isMapAssetPath('/api/v1/map3d/' + path), false, path)
	assert.equal(isMapAssetPath('/api/v1/users'), false)
})
test('metrics keep bounded labels for negative coordinates, maps and effect resources', () => {
	assert.equal(
		mapMetricRoute('/map3d/instances/05.09/chunk/-622/189'),
		'/map3d/instances/:instance/chunk/:x/:z'
	)
	assert.equal(
		mapMetricRoute('/map3d/instances/Forge/terrain-lod/regions/-39/-11'),
		'/map3d/instances/:instance/terrain-lod/regions/:x/:z'
	)
	assert.equal(
		mapMetricRoute('/map3d/maps/Base/tile/-1/2'),
		'/map3d/maps/:map/tile/:x/:z'
	)
	assert.equal(
		mapMetricRoute('/map3d/effect-resource/effects/particles/fire.dds'),
		'/map3d/effect-resource/:resource'
	)
	assert.equal(mapMetricRoute('/users/123'), undefined)
})
