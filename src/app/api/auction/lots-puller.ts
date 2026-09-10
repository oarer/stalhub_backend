import { apiClient } from '@/app/interceptors/sc.interceptor'
import type { Lot, LotsResponse } from '@/types/api.type'

const LOT_LIMIT = 200

export const fetchItemLots = async (
	region: string,
	item_id: string
): Promise<LotsResponse['lots']> => {
	const { data } = await apiClient.get<LotsResponse>(
		`/${region}/auction/${item_id}/lots`,
		{
			params: { limit: LOT_LIMIT, additional: true },
		}
	)

	return data.lots ?? []
}

export const withRetry = async <T>(
	fn: () => Promise<T>,
	attempts = 3,
	delayMs = 1000
): Promise<T> => {
	let lastErr: unknown
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn()
		} catch (err) {
			lastErr = err
			if (attempt === attempts) break
			await new Promise((r) => setTimeout(r, delayMs * attempt))
		}
	}
	throw lastErr
}

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms))

export type LotGroups = Record<string, Lot[]>

export interface LotsPullerOptions {
	label: string
	concurrency?: number
	attemptsPerItem?: number
	itemBackoffBaseMs?: number
	requireBuyout?: boolean
	batchRetryAttempts?: number
	batchRetryDelayMs?: number
}

const DEFAULTS: Omit<Required<LotsPullerOptions>, 'label'> = {
	concurrency: 6,
	attemptsPerItem: 3,
	itemBackoffBaseMs: 1000,
	requireBuyout: true,
	batchRetryAttempts: 0,
	batchRetryDelayMs: 15000,
}

export type FetchManyResult = {
	groups: LotGroups
	failedIds: string[]
}

export class LotsPuller {
	private readonly options: Required<LotsPullerOptions>

	constructor(options: LotsPullerOptions) {
		this.options = { ...DEFAULTS, ...options }
	}

	private log = (...args: unknown[]): void =>
		console.log(`[${this.options.label}]`, ...args)

	private async fetchItemWithRetry(
		region: string,
		itemId: string
	): Promise<{ lots: Lot[]; failed: boolean }> {
		const { attemptsPerItem, itemBackoffBaseMs, requireBuyout } =
			this.options
		let lastLots: Lot[] = []

		for (let attempt = 1; attempt <= attemptsPerItem; attempt++) {
			try {
				const lots = await fetchItemLots(region, itemId)
				lastLots = lots
				if (!requireBuyout || lots.some((lot) => lot.buyoutPrice > 0)) {
					return { lots, failed: false }
				}
			} catch {
				// ретраим позже
			}

			if (attempt < attemptsPerItem) {
				await sleep(itemBackoffBaseMs * 2 ** (attempt - 1))
			}
		}

		return { lots: lastLots, failed: true }
	}

	async fetchMany(
		region: string,
		itemIds: readonly string[]
	): Promise<FetchManyResult> {
		const { concurrency } = this.options
		const groups: LotGroups = {}
		const failedIds: string[] = []
		let index = 0

		const worker = async () => {
			while (index < itemIds.length) {
				const i = index++
				const itemId = itemIds[i]
				const { lots, failed } = await this.fetchItemWithRetry(
					region,
					itemId
				)
				groups[itemId] = lots
				if (failed) failedIds.push(itemId)
			}
		}

		await Promise.all(
			Array.from({ length: Math.min(concurrency, itemIds.length) }, () =>
				worker()
			)
		)

		return { groups, failedIds }
	}

	async fetchWithBatchRetry(
		region: string,
		itemIds: readonly string[]
	): Promise<FetchManyResult> {
		const { batchRetryAttempts, batchRetryDelayMs } = this.options
		let result = await this.fetchMany(region, itemIds)

		for (
			let attempt = 1;
			attempt <= batchRetryAttempts &&
			result.failedIds.length === itemIds.length;
			attempt++
		) {
			this.log(
				`${region}: all ${itemIds.length} items empty, retrying batch (attempt ${attempt}/${batchRetryAttempts})...`
			)
			await sleep(batchRetryDelayMs)
			result = await this.fetchMany(region, itemIds)
		}

		return result
	}

	async drainFailed(
		region: string,
		failedIds: string[],
		onBatch: (
			groups: LotGroups,
			stillFailed: string[]
		) => void | Promise<void>,
		{
			maxAttempts = 3,
			retryDelayMs = 60_000,
		}: {
			maxAttempts?: number
			retryDelayMs?: number
		} = {}
	): Promise<void> {
		let current = failedIds

		for (
			let attempt = 1;
			attempt <= maxAttempts && current.length > 0;
			attempt++
		) {
			this.log(
				`${region}: retrying ${current.length} failed items (attempt ${attempt}/${maxAttempts})...`
			)
			await sleep(retryDelayMs)

			const { groups, failedIds: stillFailed } = await this.fetchMany(
				region,
				current
			)
			await onBatch(groups, stillFailed)
			current = stillFailed
		}
	}
}
