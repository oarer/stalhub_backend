import { describe, expect, test } from 'bun:test'
import { normalizeAssetUrl } from '@/app/api/uno/render'

describe('UNO gear render metadata', () => {
	test('normalizes asset namespaces and relative paths', () => {
		expect(normalizeAssetUrl('weapons:models/rifle.glb')).toBe(
			'https://cdn.stalhub.dev/weapons/models/rifle.glb'
		)
		expect(normalizeAssetUrl('models/armor/test.glb')).toBe(
			'https://cdn.stalhub.dev/sc/stalker/models/armor/test.glb'
		)
		expect(normalizeAssetUrl('https://assets.example/model.glb')).toBe(
			'https://assets.example/model.glb'
		)
		expect(normalizeAssetUrl(null)).toBeUndefined()
	})
})
