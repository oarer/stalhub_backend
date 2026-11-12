import { describe, expect, test } from 'bun:test'
import {
	sortIpStats,
	type UnoIpStatItem,
} from '@/app/api/admin/uno/uno.service'
import { isValidIp } from '@/utils/auto-ban/uno'

describe('isValidIp', () => {
	test('accepts IPv4 quads', () => {
		expect(isValidIp('1.2.3.4')).toBe(true)
		expect(isValidIp('0.0.0.0')).toBe(true)
		expect(isValidIp('255.255.255.255')).toBe(true)
	})

	test('rejects invalid IPv4', () => {
		expect(isValidIp('1.2.3.256')).toBe(false)
		expect(isValidIp('01.2.3.4')).toBe(false)
		expect(isValidIp('1.2.3')).toBe(false)
		expect(isValidIp('1.2.3.4.5')).toBe(false)
		expect(isValidIp('a.b.c.d')).toBe(false)
	})

	test('accepts IPv6 forms', () => {
		expect(isValidIp('::1')).toBe(true)
		expect(isValidIp('::')).toBe(true)
		expect(isValidIp('2001:db8::1')).toBe(true)
		expect(isValidIp('fe80::a1b2:c3d4')).toBe(true)
		expect(isValidIp('::ffff:1.2.3.4')).toBe(true)
	})

	test('rejects invalid IPv6 and junk', () => {
		expect(isValidIp('gggg::1')).toBe(false)
		expect(isValidIp('1.2.3.4:')).toBe(false)
		expect(isValidIp('example.com')).toBe(false)
		expect(isValidIp('')).toBe(false)
		expect(isValidIp(`${'a'.repeat(45)}:1`)).toBe(false)
	})
})

describe('sortIpStats', () => {
	test('sorts by hits descending', () => {
		const items: UnoIpStatItem[] = [
			{
				ip: '1.1.1.1',
				hits: 5,
				auto_blocked: false,
				manual_banned: false,
			},
			{
				ip: '2.2.2.2',
				hits: 90,
				auto_blocked: true,
				manual_banned: false,
			},
			{
				ip: '3.3.3.3',
				hits: 0,
				auto_blocked: false,
				manual_banned: true,
			},
		]
		const sorted = sortIpStats(items)
		expect(sorted.map((item) => item.ip)).toEqual([
			'2.2.2.2',
			'1.1.1.1',
			'3.3.3.3',
		])
	})

	test('does not mutate the input array', () => {
		const items: UnoIpStatItem[] = [
			{
				ip: '1.1.1.1',
				hits: 5,
				auto_blocked: false,
				manual_banned: false,
			},
			{
				ip: '2.2.2.2',
				hits: 90,
				auto_blocked: false,
				manual_banned: false,
			},
		]
		sortIpStats(items)
		expect(items[0].ip).toBe('1.1.1.1')
	})

	test('keeps manual bans with zero hits in the list', () => {
		const items: UnoIpStatItem[] = [
			{
				ip: '3.3.3.3',
				hits: 0,
				auto_blocked: false,
				manual_banned: true,
			},
			{
				ip: '4.4.4.4',
				hits: 0,
				auto_blocked: false,
				manual_banned: false,
			},
		]
		expect(sortIpStats(items)).toHaveLength(2)
	})
})
