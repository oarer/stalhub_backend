export type DebounceTask = (
	isLatest: () => boolean
) => unknown | Promise<unknown>
export type DebounceCancellation = () => unknown | Promise<unknown>

type Entry<Key> = {
	key: Key
	version: number
	timer: ReturnType<typeof setTimeout> | null
	task: DebounceTask
	onCancel: DebounceCancellation
	resolve: () => void
	reject: (error: unknown) => void
	cancelled: boolean
}

export class KeyedDebouncer<Key> {
	private readonly entries = new Map<Key, Entry<Key>>()
	private readonly generations = new Map<Key, number>()

	constructor(
		private readonly delayMs: number,
		private readonly setTimeoutImpl: typeof setTimeout = setTimeout,
		private readonly clearTimeoutImpl: typeof clearTimeout = clearTimeout
	) {}

	schedule(
		key: Key,
		task: DebounceTask,
		onCancel: DebounceCancellation = () => undefined
	): Promise<void> {
		const version = (this.generations.get(key) ?? 0) + 1
		this.generations.set(key, version)
		const previous = this.entries.get(key)
		if (previous) this.cancelEntry(previous)

		return new Promise<void>((resolve, reject) => {
			const entry: Entry<Key> = {
				key,
				version,
				timer: null,
				task,
				onCancel,
				resolve,
				reject,
				cancelled: false,
			}
			entry.timer = this.setTimeoutImpl(() => {
				if (this.entries.get(key) !== entry || entry.cancelled) {
					resolve()
					return
				}
				entry.timer = null
				Promise.resolve()
					.then(() => entry.task(() => this.isLatest(key, version)))
					.then(() => resolve(), reject)
					.finally(() => {
						if (this.entries.get(key) === entry)
							this.entries.delete(key)
					})
			}, this.delayMs)
			this.entries.set(key, entry)
		})
	}

	clear(key: Key): void {
		this.generations.set(key, (this.generations.get(key) ?? 0) + 1)
		const entry = this.entries.get(key)
		if (entry) this.cancelEntry(entry)
	}

	dispose(): void {
		for (const key of this.entries.keys()) this.clear(key)
	}

	pendingCount(): number {
		let count = 0
		for (const entry of this.entries.values()) {
			if (entry.timer !== null) count += 1
		}
		return count
	}

	private isLatest(key: Key, version: number): boolean {
		return this.generations.get(key) === version
	}

	private cancelEntry(entry: Entry<Key>): void {
		if (entry.cancelled) return
		entry.cancelled = true
		if (entry.timer !== null) {
			this.clearTimeoutImpl(entry.timer)
			entry.timer = null
		}
		if (this.entries.get(entry.key) === entry)
			this.entries.delete(entry.key)
		Promise.resolve()
			.then(() => entry.onCancel())
			.then(entry.resolve, entry.reject)
	}
}
