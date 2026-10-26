import { describe, expect, test } from 'bun:test'
import { profileSessionKey, SessionStore, shortHash } from '../src/session'

describe('SessionStore', () => {
	test('stores and returns values by key', () => {
		const store = new SessionStore<string>(60_000)
		store.set('a', 'first')
		expect(store.get('a')).toBe('first')
		expect(store.get('missing')).toBeNull()
	})

	test('overrides values for the same key', () => {
		const store = new SessionStore<number>(60_000)
		store.set('k', 1)
		store.set('k', 2)
		expect(store.get('k')).toBe(2)
	})

	test('expires entries after ttl', () => {
		let now = 1_000
		const store = new SessionStore<number>(500, () => now)
		store.set('k', 7)
		expect(store.get('k')).toBe(7)
		now = 1_501
		expect(store.get('k')).toBeNull()
	})

	test('prunes expired entries on set', () => {
		let now = 1_000
		const store = new SessionStore<number>(500, () => now)
		store.set('old', 1)
		now = 2_000
		store.set('fresh', 2)
		expect(store.get('old')).toBeNull()
		expect(store.get('fresh')).toBe(2)
	})
})

describe('shortHash', () => {
	test('is deterministic and 8 hex characters', () => {
		const first = shortHash('RU:Nick')
		const second = shortHash('RU:Nick')
		expect(first).toBe(second)
		expect(first).toMatch(/^[0-9a-f]{8}$/)
	})

	test('differs for different inputs', () => {
		expect(shortHash('RU:Nick')).not.toBe(shortHash('EU:Nick'))
	})

	test('profileSessionKey normalizes username case', () => {
		expect(profileSessionKey('RU', 'Nick')).toBe(
			profileSessionKey('RU', 'nick')
		)
	})
})
