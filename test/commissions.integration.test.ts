import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHmac, randomUUID } from 'node:crypto'

const enabled = process.env.STALHUB_COMMISSION_TEST === '1'
const prefix = `commission_${Date.now()}`
let db: typeof import('../src/lib/prisma').prisma
let app: ReturnType<typeof import('../src/utils/elysia').createElysia>
const users: Record<string, { id: number; username: string; cookie: string }> =
	{}
let orderId = ''
let profileVersion = 0
let priceIds: string[] = []
let referenceId = ''
const due = () => new Date(Date.now() + 7 * 86400000).toISOString()

async function request(path: string, who = '', method = 'GET', body?: unknown) {
	return app.handle(
		new Request(`http://localhost/api/v1/commissions${path}`, {
			method,
			headers: {
				...(users[who] ? { cookie: users[who].cookie } : {}),
				...(body === undefined
					? {}
					: { 'content-type': 'application/json' }),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		})
	)
}
async function json(
	path: string,
	who = '',
	method = 'GET',
	body?: unknown,
	expected = 200
) {
	const response = await request(path, who, method, body)
	const value = await response.json()
	expect({ status: response.status, error: value?.error }).toEqual({
		status: expected,
		error: expected >= 400 ? expect.any(String) : undefined,
	})
	return value
}
async function command(
	who: string,
	action: string,
	extra: Record<string, unknown> = {},
	expected = 200,
	id = orderId
) {
	const order = await db.commissionOrder.findUniqueOrThrow({ where: { id } })
	return json(
		`/orders/${id}/actions`,
		who,
		'POST',
		{ key: randomUUID(), version: order.version, action, ...extra },
		expected
	)
}
async function upload(
	who: string,
	name = 'reference.png',
	bytes = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
		'base64'
	)
) {
	const data = new FormData()
	data.append('file', new File([bytes], name, { type: 'image/png' }))
	return app.handle(
		new Request('http://localhost/api/v1/commissions/files', {
			method: 'POST',
			headers: { cookie: users[who].cookie },
			body: data,
		})
	)
}

beforeAll(async () => {
	if (!enabled) return
	const url = new URL(process.env.DATABASE_URL ?? '')
	if (
		!['localhost', '127.0.0.1'].includes(url.hostname) ||
		url.pathname !== '/stalhub_commission_test'
	)
		throw new Error('Disposable commission test database required')
	process.env.NODE_ENV = 'development'
	process.env.LAUNCHER_SOURCES = 'https://offline.invalid'
	process.env.LAUNCHER_AUTH_QUERY = 'offline'
	process.env.OPENAI_API_KEY = 'offline-test'
	process.env.JWT_SECRET = 'commission-test-only-key'
	process.env.COMMISSION_FILES_DIR = `${process.cwd()}/runtime/commission-test/files`
	db = (await import('../src/lib/prisma')).prisma
	const { commissionsRoutes } = await import('../src/app/api/commissions')
	const { createElysia } = await import('../src/utils/elysia')
	app = createElysia({ prefix: '/api/v1' }).use(
		commissionsRoutes
	) as typeof app
	const permission = await db.permission.upsert({
		where: { name: 'commission:arbitrate' },
		create: { name: 'commission:arbitrate' },
		update: {},
	})
	const artist = await db.role.upsert({
		where: { name: 'author' },
		create: { name: 'author' },
		update: {},
	})
	const arbiter = await db.role.create({
		data: {
			name: `${prefix}_arbiter`,
			permissions: { connect: { id: permission.id } },
		},
	})
	for (const name of [
		'artist',
		'customer',
		'other',
		'artist2',
		'arbiter',
		'arbiter2',
	]) {
		const user = await db.user.create({
			data: {
				username: `${prefix}_${name}`,
				name,
				onboarded: true,
				user_settings: { create: {} },
				roles: name.startsWith('artist')
					? { connect: { id: artist.id } }
					: name.startsWith('arbiter')
						? { connect: { id: arbiter.id } }
						: undefined,
			},
		})
		const session = await db.sessions.create({
			data: { user_id: user.id, session_id: randomUUID() },
		})
		const encode = (value: unknown) =>
			Buffer.from(JSON.stringify(value)).toString('base64url')
		const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: String(user.id), sid: session.session_id, exp: Math.floor(Date.now() / 1000) + 3600 })}`
		users[name] = {
			id: user.id,
			username: user.username,
			cookie: `access_token=${data}.${createHmac('sha256', process.env.JWT_SECRET).update(data).digest('base64url')}`,
		}
	}
})
afterAll(async () => {
	if (enabled) await db?.$disconnect()
})

describe.skipIf(!enabled)(
	'commissions real PostgreSQL and authenticated API',
	() => {
		test('public catalogue is public, private routes require a real session', async () => {
			await json('/artists')
			await json('/orders', '', 'GET', undefined, 401)
			await json('/profile', 'customer', 'GET', undefined, 403)
			expect(await json('/profile', 'artist')).toBeNull()
			const result = await json('/profile', 'artist', 'PUT', {
				version: 0,
				description: 'Test artist',
				accepting: true,
				currency: 'RUB',
				terms: 'Test terms: outside payment',
				revisions: 1,
				portfolio_ids: [],
				prices: [
					{
						title: 'Portrait',
						description: 'Face',
						amount: 10001,
						days_min: 2,
						days_max: 4,
					},
					{
						title: 'Background',
						description: 'Scene',
						amount: 4999,
						days_min: 1,
						days_max: 2,
					},
				],
			})
			profileVersion = result.version
			priceIds = result.prices.map((p: { id: string }) => p.id)
			expect(
				(await json(`/artists/${users.artist.username}`)).prices
			).toHaveLength(2)
		})
		test('private reference upload, ownership, invalid file signature and public path denial', async () => {
			const response = await upload('customer')
			expect(response.status).toBe(200)
			referenceId = (await response.json()).id
			expect(
				(await request(`/files/${referenceId}`, 'other')).status
			).toBe(404)
			expect(
				(
					await request(`/files/${referenceId}`, 'customer')
				).headers.get('cache-control')
			).toBe('private, no-store')
			expect(
				(
					await upload(
						'customer',
						'fake.png',
						Buffer.from('<html>not an image</html>')
					)
				).status
			).toBe(400)
			expect(
				(
					await app.handle(
						new Request(`http://localhost/uploads/${referenceId}`)
					)
				).status
			).toBe(404)
		})
		test('price selection then brief creates immutable snapshot, no self order or stale price', async () => {
			const input = {
				key: randomUUID(),
				artist_id: users.artist.id,
				profile_version: profileVersion,
				price_ids: priceIds,
				title: 'Two selected items',
				brief: 'Please draw this test scene.',
				file_ids: [referenceId],
			}
			await json(
				'/orders',
				'artist',
				'POST',
				{ ...input, file_ids: [] },
				400
			)
			await json(
				'/orders',
				'customer',
				'POST',
				{ ...input, profile_version: profileVersion + 1 },
				409
			)
			const result = await json('/orders', 'customer', 'POST', input)
			orderId = result.id
			expect((await json('/orders', 'customer', 'POST', input)).id).toBe(
				orderId
			)
			await json(`/orders/${orderId}`, 'other', 'GET', undefined, 404)
			const order = await json(`/orders/${orderId}`, 'customer')
			expect(order.total).toBe(15000)
			expect(order.items).toHaveLength(2)
			const profile = await json('/profile', 'artist')
			await json('/profile', 'artist', 'PUT', {
				...profile,
				prices: profile.prices.map((p: { amount: number }) => ({
					...p,
					amount: 99999,
				})),
			})
			expect((await json(`/orders/${orderId}`, 'customer')).total).toBe(
				15000
			)
			expect(
				(await request(`/files/${referenceId}`, 'artist')).status
			).toBe(200)
			await json(
				`/files/${referenceId}`,
				'customer',
				'DELETE',
				undefined,
				404
			)
		})
		test('staged payments require exact total and real artist confirmation', async () => {
			await command(
				'artist',
				'accept',
				{
					due_at: due(),
					payments: [
						{
							title: 'Wrong',
							amount: 1,
							upfront: true,
							instructions: 'test',
						},
					],
				},
				400
			)
			await command('artist', 'accept', {
				due_at: due(),
				payments: [
					{
						title: 'Deposit',
						amount: 5000,
						upfront: true,
						instructions: 'Private details',
					},
					{
						title: 'Balance',
						amount: 10000,
						upfront: false,
						instructions: 'Private details',
					},
				],
			})
			await command('artist', 'start', {}, 409)
			const deposit = await db.commissionPayment.findFirstOrThrow({
				where: { order_id: orderId, upfront: true },
			})
			await command(
				'customer',
				'payment_received',
				{ target_id: deposit.id },
				403
			)
			await command('customer', 'payment_sent', { target_id: deposit.id })
			await command('artist', 'start', {}, 409)
			await command('artist', 'payment_reject', {
				target_id: deposit.id,
				content: 'Not found, please check',
			})
			await command('customer', 'payment_sent', { target_id: deposit.id })
			await command('artist', 'payment_received', {
				target_id: deposit.id,
			})
			await command(
				'artist',
				'payment_received',
				{ target_id: deposit.id },
				409
			)
			await command('artist', 'start')
		})
		test('messages are idempotent, paginated and unread only for the other participant', async () => {
			const order = await db.commissionOrder.findUniqueOrThrow({
				where: { id: orderId },
			})
			const input = {
				key: randomUUID(),
				version: order.version,
				action: 'message',
				content: 'Private test message',
			}
			await json(`/orders/${orderId}/actions`, 'customer', 'POST', input)
			await json(`/orders/${orderId}/actions`, 'customer', 'POST', input)
			expect(
				await db.commissionMessage.count({
					where: { order_id: orderId, key: input.key },
				})
			).toBe(1)
			const page = await json(`/orders/${orderId}/messages`, 'artist')
			expect(page.data.at(-1).content).toBe('Private test message')
			await json(
				`/orders/${orderId}/messages`,
				'other',
				'GET',
				undefined,
				404
			)
			await json(`/orders/${orderId}/read`, 'artist', 'POST', {
				through: page.data.at(-1).id,
			})
			expect(
				(await json('/orders?side=artist', 'artist')).data.find(
					(o: { id: string }) => o.id === orderId
				).unread
			).toBe(false)
		})
		test('delivery, one revision round, full payment and customer acceptance', async () => {
			await command('artist', 'deliver', { content: 'First result' })
			await command('customer', 'revise', {
				content: 'Please adjust the colors',
			})
			await command('artist', 'deliver', {
				content: 'Final revised result',
			})
			await command(
				'customer',
				'revise',
				{ content: 'More changes' },
				409
			)
			await command('customer', 'approve', {}, 409)
			const balance = await db.commissionPayment.findFirstOrThrow({
				where: { order_id: orderId, upfront: false },
			})
			await command('artist', 'payment_received', {
				target_id: balance.id,
			})
			await command('customer', 'approve')
			expect((await json(`/orders/${orderId}`, 'customer')).status).toBe(
				'COMPLETED'
			)
		})
		test('customer rating stays private even in messages and order detail', async () => {
			await command(
				'customer',
				'review',
				{ score: 1, content: 'Not allowed' },
				403
			)
			await command('artist', 'review', {
				score: 4,
				content: 'PRIVATE_REPUTATION_MARKER',
			})
			const reputation = await json(
				`/reputation/${users.customer.id}`,
				'artist2'
			)
			expect(reputation.average).toBe(4)
			expect(reputation.total).toBe(1)
			await json(
				`/reputation/${users.customer.id}`,
				'customer',
				'GET',
				undefined,
				403
			)
			await json(
				`/reputation/${users.customer.id}`,
				'other',
				'GET',
				undefined,
				403
			)
			expect(
				JSON.stringify(
					await json(`/orders/${orderId}/messages`, 'customer')
				)
			).not.toContain('PRIVATE_REPUTATION_MARKER')
			expect(
				JSON.stringify(await json(`/orders/${orderId}`, 'customer'))
			).not.toContain('PRIVATE_REPUTATION_MARKER')
			await command('artist', 'review', {
				score: 5,
				content: 'PRIVATE_REPUTATION_MARKER',
			})
			expect(
				await db.commissionReview.count({
					where: { order_id: orderId },
				})
			).toBe(1)
		})
		test('review complaints require independent assigned arbiter and hide rating from aggregate', async () => {
			await command('customer', 'review_report', {
				content: 'Please investigate the review',
			})
			const entry = await db.commissionCase.findFirstOrThrow({
				where: { order_id: orderId, kind: 'REVIEW' },
			})
			await json(`/orders/${orderId}`, 'arbiter', 'GET', undefined, 404)
			await json(`/cases/${entry.id}/actions`, 'arbiter', 'POST', {
				key: randomUUID(),
				version: entry.version,
				action: 'claim',
			})
			const claimed = await json(`/cases/${entry.id}`, 'arbiter')
			expect(claimed.review.content).toBe('PRIVATE_REPUTATION_MARKER')
			await json(
				`/cases/${entry.id}/actions`,
				'arbiter2',
				'POST',
				{
					key: randomUUID(),
					version: claimed.version,
					action: 'decide',
					outcome: 'HIDE_REVIEW',
					content: 'This review violates the rules',
					obligations: 'Hide the review, no money transfer',
				},
				403
			)
			await json(`/cases/${entry.id}/actions`, 'arbiter', 'POST', {
				key: randomUUID(),
				version: claimed.version,
				action: 'decide',
				outcome: 'HIDE_REVIEW',
				content: 'This review violates the rules',
				obligations: 'Hide the review, no money transfer',
			})
			expect(
				(await json(`/reputation/${users.customer.id}`, 'artist2'))
					.total
			).toBe(0)
			await command(
				'artist',
				'review',
				{ score: 1, content: 'Cannot restore hidden review' },
				409
			)
		})
		test('order arbitration freezes transitions, caps refunds and tracks actual external receipt', async () => {
			await command('customer', 'dispute', {
				content: 'The delivered file has a problem',
			})
			const entry = await db.commissionCase.findFirstOrThrow({
				where: { order_id: orderId, kind: 'ORDER' },
			})
			await command(
				'customer',
				'cancel',
				{ content: 'Cannot bypass dispute' },
				409
			)
			await json(`/cases/${entry.id}/actions`, 'arbiter', 'POST', {
				key: randomUUID(),
				version: entry.version,
				action: 'claim',
			})
			const claimed = await json(`/cases/${entry.id}`, 'arbiter')
			await json(
				`/cases/${entry.id}/actions`,
				'arbiter',
				'POST',
				{
					key: randomUUID(),
					version: claimed.version,
					action: 'decide',
					outcome: 'CANCEL',
					refund: 15001,
					due_at: due(),
					content: 'Partial refund is appropriate',
					obligations: 'Cancel, waive balance and refund externally',
				},
				400
			)
			await json(`/cases/${entry.id}/actions`, 'arbiter', 'POST', {
				key: randomUUID(),
				version: claimed.version,
				action: 'decide',
				outcome: 'CANCEL',
				refund: 5000,
				due_at: due(),
				content: 'Partial refund is appropriate',
				obligations: 'Cancel, waive balance and refund externally',
			})
			const order = await json(`/orders/${orderId}`, 'customer')
			expect(order.status).toBe('CANCELLED')
			expect(order.refunds[0].status).toBe('EXPECTED')
			const proof = await (await upload('artist')).json()
			await command('artist', 'refund_sent', {
				target_id: order.refunds[0].id,
				file_ids: [proof.id],
				content: 'Sent outside the site',
			})
			expect(
				(await json(`/orders/${orderId}`, 'customer')).refunds[0].status
			).toBe('SENT')
			await command('customer', 'refund_received', {
				target_id: order.refunds[0].id,
			})
			await command(
				'customer',
				'refund_received',
				{ target_id: order.refunds[0].id },
				409
			)
			expect(
				(await json(`/orders/${orderId}`, 'customer')).refunds[0].status
			).toBe('RECEIVED')
		})
		test('concurrent requests cannot mix participants, and racing commands remain atomic', async () => {
			const reads = await Promise.all(
				Array.from({ length: 30 }, (_, index) =>
					request(
						`/orders/${orderId}`,
						index % 2 ? 'other' : 'customer'
					)
				)
			)
			for (const [index, response] of reads.entries())
				expect(response.status).toBe(index % 2 ? 404 : 200)
			const order = await db.commissionOrder.findUniqueOrThrow({
				where: { id: orderId },
			})
			const input = {
				key: randomUUID(),
				version: order.version,
				action: 'message',
				content: 'Idempotent parallel send',
			}
			const duplicates = await Promise.all([
				request(
					`/orders/${orderId}/actions`,
					'customer',
					'POST',
					input
				),
				request(
					`/orders/${orderId}/actions`,
					'customer',
					'POST',
					input
				),
			])
			expect(duplicates.map((r) => r.status)).toEqual([200, 200])
			expect(
				await db.commissionMessage.count({
					where: { order_id: orderId, key: input.key },
				})
			).toBe(1)
			const version = (
				await db.commissionOrder.findUniqueOrThrow({
					where: { id: orderId },
				})
			).version
			const competing = await Promise.all(
				['A', 'B'].map((content) =>
					request(`/orders/${orderId}/actions`, 'customer', 'POST', {
						key: randomUUID(),
						version,
						action: 'message',
						content,
					})
				)
			)
			expect(competing.map((r) => r.status).sort()).toEqual([200, 409])
		})
		test('decline and cancellation preserve independent payment history', async () => {
			const profile = await json('/profile', 'artist')
			const make = async () =>
				(
					await json('/orders', 'customer', 'POST', {
						key: randomUUID(),
						artist_id: users.artist.id,
						profile_version: profile.version,
						price_ids: profile.prices.map(
							(p: { id: string }) => p.id
						),
						title: 'Cancellation flow',
						brief: 'A genuine detailed brief for testing.',
						file_ids: [],
					})
				).id as string
			const declined = await make()
			await command(
				'artist',
				'decline',
				{ content: 'Cannot take this request' },
				200,
				declined
			)
			expect((await json(`/orders/${declined}`, 'customer')).status).toBe(
				'DECLINED'
			)
			const pending = await make()
			await command(
				'customer',
				'cancel',
				{ content: 'Changed my mind before acceptance' },
				200,
				pending
			)
			expect((await json(`/orders/${pending}`, 'customer')).status).toBe(
				'CANCELLED'
			)
			const accepted = await make()
			const total = (await json(`/orders/${accepted}`, 'customer')).total
			await command(
				'artist',
				'accept',
				{
					due_at: due(),
					payments: [
						{
							title: 'Full payment',
							amount: total,
							upfront: true,
							instructions: 'Outside site',
						},
					],
				},
				200,
				accepted
			)
			const payment = await db.commissionPayment.findFirstOrThrow({
				where: { order_id: accepted },
			})
			await command(
				'artist',
				'payment_received',
				{ target_id: payment.id },
				200,
				accepted
			)
			await command(
				'artist',
				'cancel',
				{ content: 'Requesting a mutually agreed cancellation' },
				200,
				accepted
			)
			await command('customer', 'cancel_reject', {}, 200, accepted)
			expect((await json(`/orders/${accepted}`, 'customer')).status).toBe(
				'ACCEPTED'
			)
			await command(
				'artist',
				'cancel',
				{ content: 'Requesting cancellation again' },
				200,
				accepted
			)
			await command('customer', 'cancel_confirm', {}, 200, accepted)
			const final = await json(`/orders/${accepted}`, 'customer')
			expect(final.status).toBe('CANCELLED')
			expect(final.payments[0].status).toBe('RECEIVED')
			expect(final.refunds).toHaveLength(0)
		})
		test('closed intake rejects requests and losing author role does not erase existing obligations', async () => {
			const profile = await json('/profile', 'artist')
			await json('/profile', 'artist', 'PUT', {
				...profile,
				accepting: false,
			})
			await json(
				'/orders',
				'customer',
				'POST',
				{
					key: randomUUID(),
					artist_id: users.artist.id,
					profile_version: profile.version + 1,
					price_ids: priceIds,
					title: 'Closed intake',
					brief: 'A detailed testing brief.',
					file_ids: [],
				},
				409
			)
			const author = await db.role.findUniqueOrThrow({
				where: { name: 'author' },
			})
			await db.user.update({
				where: { id: users.artist.id },
				data: { roles: { disconnect: { id: author.id } } },
			})
			await json(`/orders/${orderId}`, 'artist')
			await json('/profile', 'artist', 'GET', undefined, 403)
			await command(
				'artist',
				'review',
				{ score: 1, content: 'No current author role' },
				403
			)
			await db.user.update({
				where: { id: users.artist.id },
				data: { roles: { connect: { id: author.id } } },
			})
		})
		test('arbiter cannot assign their own order even when explicitly granted permission', async () => {
			const role = await db.role.findUniqueOrThrow({
				where: { name: `${prefix}_arbiter` },
			})
			await db.user.update({
				where: { id: users.artist.id },
				data: { roles: { connect: { id: role.id } } },
			})
			const entry = await db.commissionCase.findFirstOrThrow({
				where: { order_id: orderId, kind: 'ORDER' },
			})
			await json(
				`/cases/${entry.id}/actions`,
				'artist',
				'POST',
				{ key: randomUUID(), version: entry.version, action: 'claim' },
				403
			)
		})
		test('an outgoing reply does not hide unread incoming messages', async () => {
			const before = await json(`/orders/${orderId}/messages`, 'artist')
			await json(`/orders/${orderId}/read`, 'artist', 'POST', {
				through: before.data.at(-1).id,
			})
			await command('customer', 'message', {
				content: 'An unread incoming message',
			})
			await command('artist', 'message', {
				content: 'Reply without scrolling to read the incoming message',
			})
			const list = await json('/orders?side=artist', 'artist')
			expect(
				list.data.find((order: { id: string }) => order.id === orderId)
					.unread
			).toBe(true)
			const after = await json(`/orders/${orderId}/messages`, 'artist')
			await json(`/orders/${orderId}/read`, 'artist', 'POST', {
				through: after.data.at(-1).id,
			})
			expect(
				(await json('/orders?side=artist', 'artist')).data.find(
					(order: { id: string }) => order.id === orderId
				).unread
			).toBe(false)
		})
		test('revoking arbiter permission removes file and material access', async () => {
			const roles = await db.role.findMany({
				where: { name: `${prefix}_arbiter` },
			})
			await db.user.update({
				where: { id: users.arbiter.id },
				data: {
					roles: { disconnect: roles.map((r) => ({ id: r.id })) },
				},
			})
			await json(`/orders/${orderId}`, 'arbiter', 'GET', undefined, 404)
			expect(
				(await request(`/files/${referenceId}`, 'arbiter')).status
			).toBe(404)
			const entry = await db.commissionCase.findFirstOrThrow({
				where: { order_id: orderId, kind: 'ORDER' },
			})
			const queue = await json('/cases', 'arbiter2')
			expect(
				queue.data.find((c: { id: string }) => c.id === entry.id)
					.claimable
			).toBe(true)
			await json(`/cases/${entry.id}/actions`, 'arbiter2', 'POST', {
				key: randomUUID(),
				version: entry.version,
				action: 'claim',
			})
			await json(`/orders/${orderId}`, 'arbiter2')
		})
	}
)
