import { describe, expect, test } from 'bun:test'
import { KeyedDebouncer } from '../src/debounce'

type TimerId = ReturnType<typeof setTimeout>

type TestClock = {
	setTimeoutImpl: typeof setTimeout
	clearTimeoutImpl: typeof clearTimeout
	fire: () => void
}

function createTestClock(): TestClock {
	const timers = new Map<number, () => void>()
	let nextId = 0
	return {
		setTimeoutImpl: ((callback: () => void) => {
			const id = ++nextId
			timers.set(id, callback)
			return id as unknown as TimerId
		}) as typeof setTimeout,
		clearTimeoutImpl: ((id: TimerId) => {
			timers.delete(id as unknown as number)
		}) as typeof clearTimeout,
		fire: () => {
			const callbacks = [...timers.values()]
			timers.clear()
			for (const callback of callbacks) callback()
		},
	}
}

describe('KeyedDebouncer', () => {
	test('cancels the previous request and runs only the latest one', async () => {
		const clock = createTestClock()
		const debouncer = new KeyedDebouncer(
			250,
			clock.setTimeoutImpl,
			clock.clearTimeoutImpl
		)
		const calls: string[] = []
		const cancellations: string[] = []
		const first = debouncer.schedule(
			'user',
			() => calls.push('first'),
			() => cancellations.push('first')
		)
		const second = debouncer.schedule(
			'user',
			() => calls.push('second'),
			() => cancellations.push('first')
		)

		expect(debouncer.pendingCount()).toBe(1)
		clock.fire()
		await Promise.all([first, second])

		expect(calls).toEqual(['second'])
		expect(cancellations).toEqual(['first'])
	})

	test('does not publish a result from an in-flight stale request', async () => {
		const clock = createTestClock()
		const debouncer = new KeyedDebouncer(
			250,
			clock.setTimeoutImpl,
			clock.clearTimeoutImpl
		)
		const calls: string[] = []
		let releaseFirst!: () => void
		let firstFinished!: () => void
		const firstDone = new Promise<void>((resolve) => {
			releaseFirst = resolve
		})
		const firstFinishedPromise = new Promise<void>((resolve) => {
			firstFinished = resolve
		})
		const first = debouncer.schedule(
			'user',
			async (isLatest) => {
				await firstDone
				if (isLatest()) calls.push('first')
				firstFinished()
			},
			() => undefined
		)

		clock.fire()
		await Promise.resolve()
		const second = debouncer.schedule(
			'user',
			() => calls.push('second'),
			() => undefined
		)
		clock.fire()
		await second
		releaseFirst()
		await firstFinishedPromise
		await first

		expect(calls).toEqual(['second'])
	})

	test('keeps different users independent', async () => {
		const clock = createTestClock()
		const debouncer = new KeyedDebouncer(
			250,
			clock.setTimeoutImpl,
			clock.clearTimeoutImpl
		)
		const calls: string[] = []
		const firstUser = debouncer.schedule('first', () => calls.push('first'))
		const secondUser = debouncer.schedule('second', () =>
			calls.push('second')
		)
		const replacement = debouncer.schedule('first', () =>
			calls.push('replacement')
		)

		clock.fire()
		await Promise.all([firstUser, secondUser, replacement])

		expect(calls).toEqual(['second', 'replacement'])
	})

	test('clears pending timers', async () => {
		const clock = createTestClock()
		const debouncer = new KeyedDebouncer(
			250,
			clock.setTimeoutImpl,
			clock.clearTimeoutImpl
		)
		const pending = debouncer.schedule('user', () => undefined)

		expect(debouncer.pendingCount()).toBe(1)
		debouncer.clear('user')
		await pending
		expect(debouncer.pendingCount()).toBe(0)

		debouncer.schedule('user', () => undefined)
		debouncer.dispose()
		expect(debouncer.pendingCount()).toBe(0)
	})
})
