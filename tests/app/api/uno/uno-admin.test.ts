import { describe, expect, test } from 'bun:test'
import {
	sortIpStats,
	type UnoIpStatItem,
} from '@/app/api/admin/uno/uno.service'
import { isTrustedProxyIp, normalizeIp } from '@/utils/auto-ban'
import { isValidIp } from '@/utils/auto-ban/uno'

describe('normalizeIp', () => {
	test('strips the IPv4-mapped prefix from a valid mapped address', () => {
		expect(normalizeIp('::ffff:172.19.0.1')).toBe('172.19.0.1')
		expect(normalizeIp('::FFFF:10.0.0.5')).toBe('10.0.0.5')
	})

	test('keeps plain addresses unchanged', () => {
		expect(normalizeIp('172.19.0.1')).toBe('172.19.0.1')
		expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1')
	})

	test('keeps the prefix when the remainder is not a real IPv4', () => {
		expect(normalizeIp('::ffff:not-an-ip')).toBe('::ffff:not-an-ip')
		expect(normalizeIp('::ffff:1.2.3.256')).toBe('::ffff:1.2.3.256')
		expect(normalizeIp('::ffff:1.2.3')).toBe('::ffff:1.2.3')
	})
})

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

describe('isTrustedProxyIp', () => {
	test('trusts mapped IPv4 socket IP via CIDR (production bug case)', () => {
		expect(isTrustedProxyIp('::ffff:172.19.0.1', ['172.19.0.0/16'])).toBe(
			true
		)
	})

	test('trusts mapped IPv4 socket IP via exact entry', () => {
		expect(isTrustedProxyIp('::ffff:172.19.0.1', ['172.19.0.1'])).toBe(true)
	})

	test('trusts plain IPv4 socket IP via CIDR', () => {
		expect(isTrustedProxyIp('172.19.0.1', ['172.19.0.0/16'])).toBe(true)
	})

	test('rejects mapped socket IP with empty trusted list', () => {
		expect(isTrustedProxyIp('::ffff:172.19.0.1', [])).toBe(false)
	})

	test('rejects foreign IP not in trusted list', () => {
		expect(isTrustedProxyIp('203.0.113.5', ['172.19.0.0/16'])).toBe(false)
	})

	test('always trusts loopback addresses regardless of the list', () => {
		expect(isTrustedProxyIp('::1', [])).toBe(true)
		expect(isTrustedProxyIp('127.0.0.1', [])).toBe(true)
		expect(isTrustedProxyIp('::ffff:127.0.0.1', [])).toBe(true)
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
