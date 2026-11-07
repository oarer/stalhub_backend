import { describe, expect, test } from 'bun:test'
import {
	publicGlobalNotificationWhere,
	toGlobalNotificationDto,
	toGlobalNotificationListDto,
} from '@/app/api/global-notifications/global-notifications.service'
import {
	GLOBAL_NOTIFICATION_MAX_PARTS,
	isSafeGlobalNotificationHref,
	validateGlobalNotificationPayload,
} from '@/app/api/global-notifications/global-notifications.validation'

describe('global notification validation', () => {
	test('accepts structured text and safe inline links', () => {
		const result = validateGlobalNotificationPayload({
			title: 'Maintenance',
			type: 'warning',
			content: [
				{ type: 'text', text: 'Read ' },
				{ type: 'link', text: 'the status page', href: '/status' },
				{ type: 'text', text: ' or ' },
				{
					type: 'link',
					text: 'documentation',
					href: 'https://docs.example.test/notice',
				},
			],
			starts_at: '2026-11-04T10:00:00.000Z',
			expires_at: '2026-11-05T10:00:00.000Z',
		})

		expect(result.error).toBeUndefined()
		expect(result.data?.type).toBe('WARNING')
		expect(result.data?.content).toHaveLength(4)
	})

	test('rejects raw HTML and unsafe link protocols', () => {
		expect(
			validateGlobalNotificationPayload({
				title: 'x',
				type: 'info',
				content: [{ type: 'text', text: '<strong>x</strong>' }],
			}).error
		).toBeDefined()

		for (const href of [
			'javascript:alert(1)',
			' javascript:alert(1)',
			'data:text/html,alert(1)',
			'vbscript:msgbox(1)',
			'file:///tmp/a',
			'//evil.example.test/path',
		]) {
			expect(isSafeGlobalNotificationHref(href)).toBe(false)
		}
		expect(isSafeGlobalNotificationHref('/safe/path')).toBe(true)
		expect(isSafeGlobalNotificationHref('https://example.test/path')).toBe(
			true
		)
	})

	test('enforces content count, shape, and date ordering', () => {
		const base = {
			title: 'x',
			type: 'danger',
			content: [{ type: 'text', text: 'x' }],
		}
		expect(
			validateGlobalNotificationPayload({
				...base,
				content: Array(GLOBAL_NOTIFICATION_MAX_PARTS + 1).fill({
					type: 'text',
					text: 'x',
				}),
			}).error
		).toBeDefined()
		expect(
			validateGlobalNotificationPayload({
				...base,
				content: [{ type: 'link', text: 'x' }],
			}).error
		).toBeDefined()
		expect(
			validateGlobalNotificationPayload({
				...base,
				starts_at: '2026-11-05T00:00:00.000Z',
				expires_at: '2026-11-04T00:00:00.000Z',
			}).error
		).toBeDefined()
		expect(
			validateGlobalNotificationPayload({
				...base,
				starts_at: 'not-a-date',
			}).error
		).toBeDefined()
	})

	test('public query filters by active window and maps enum DTO type to lowercase', () => {
		const now = new Date('2026-11-04T12:00:00.000Z')
		expect(publicGlobalNotificationWhere(now)).toEqual({
			is_active: true,
			starts_at: { lte: now },
			OR: [{ expires_at: null }, { expires_at: { gt: now } }],
		})

		const notification = {
			id: 1,
			title: 'Title',
			type: 'DANGER',
			content: [{ type: 'text', text: 'Body' }],
			is_active: true,
			starts_at: now,
			expires_at: null,
			author_id: null,
			created_at: now,
			updated_at: now,
		}
		const dto = toGlobalNotificationDto(notification)
		expect(dto.type).toBe('danger')
		expect(toGlobalNotificationListDto([notification])).toEqual({
			data: [dto],
		})
	})
})
