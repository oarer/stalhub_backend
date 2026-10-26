import { describe, expect, test } from 'bun:test'
import { processUpdate } from '../src/index'

describe('update processing', () => {
	test('does not finish until the update handler succeeds', async () => {
		let attempts = 0
		const delays: number[] = []
		const result = await processUpdate(
			{ update_id: 42 },
			async () => {
				attempts += 1
				if (attempts === 1) throw new Error('temporary failure')
			},
			3,
			async (milliseconds) => {
				delays.push(milliseconds)
			}
		)

		expect(result).toBe('handled')
		expect(attempts).toBe(2)
		expect(delays).toEqual([250])
	})

	test('bounds retries and explicitly skips a permanently failing update', async () => {
		let attempts = 0
		const result = await processUpdate(
			{ update_id: 43 },
			async () => {
				attempts += 1
				throw new Error('permanent failure')
			},
			3,
			async () => undefined
		)

		expect(result).toBe('skipped')
		expect(attempts).toBe(3)
	})
})
