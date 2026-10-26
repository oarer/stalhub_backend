import { describe, expect, test } from 'bun:test'
import {
	type ItemBlock,
	type ItemDetail,
	ItemDetailCache,
	messageToString,
	renderItemDetail,
	statusName,
} from '../src/detail'

const weapon: ItemDetail = {
	id: 'aksu',
	category: 'weapon/assault_rifle',
	name: {
		type: 'translation',
		lines: { ru: 'АКС-74У', en: 'AKS-74U' },
	},
	color: 0 as unknown as undefined,
	status: { state: 'PERSONAL_ON_USE' },
	infoBlocks: [
		{
			type: 'list',
			title: { type: 'text', text: '' },
			elements: [
				{
					type: 'key-value',
					key: {
						type: 'translation',
						key: 'core.tooltip.info.rank',
						lines: { ru: 'Ранг' },
					},
					value: { type: 'text', text: 'Отмычка' },
				},
				{
					type: 'key-value',
					key: {
						type: 'translation',
						key: 'core.tooltip.info.category',
						lines: { ru: 'Класс' },
					},
					value: { type: 'text', text: 'Автоматы' },
				},
				{
					type: 'key-value',
					key: {
						type: 'translation',
						key: 'core.tooltip.info.durability',
						lines: { ru: 'Прочность' },
					},
					value: { type: 'text', text: 'скрытая' },
				},
			],
		},
		{ type: 'show-all-toggle' },
		{
			type: 'grouped',
			compact: [
				{
					type: 'list',
					title: { type: 'text', text: 'Боеприпасы' },
					elements: [
						{
							type: 'numeric',
							name: {
								type: 'translation',
								lines: { ru: 'Вес', en: 'Weight' },
							},
							value: 2.71,
							formatted: { value: { ru: '2,71 кг' } },
						},
						{
							type: 'range',
							name: {
								type: 'translation',
								lines: { ru: 'Дистанция' },
							},
							min: 10,
							max: 120.5,
						},
					],
				},
			],
			detailed: [
				{
					type: 'list',
					title: { type: 'text', text: 'Прицеливание' },
					elements: [
						{
							type: 'threshold',
							name: {
								type: 'translation',
								lines: { ru: 'Скорость' },
							},
							value: 5,
							limit: 100,
						},
					],
				},
			],
		},
		{
			type: 'damage',
			startDamage: 17.7,
			damageDecreaseStart: 17,
			endDamage: 12.8,
			damageDecreaseEnd: 71,
			maxDistance: 120,
		},
		{
			type: 'text',
			title: { type: 'text', text: '' },
			text: {
				type: 'translation',
				lines: {
					ru: 'Укороченная модификация автомата АК-74, был разработан в конце 1970-х — начале 1980-х годов для вооружения экипажей боевых машин и десантников. Также используется в охранных струкtovarstvax благодаря небольшим размерам и удобству ношения в стеснённых условиях cockpit машин.',
				},
			},
		},
	],
} as unknown as ItemDetail

describe('messageToString', () => {
	test('prefers ru then en lines', () => {
		expect(
			messageToString({
				type: 'translation',
				lines: { ru: 'А', en: 'B' },
			})
		).toBe('А')
		expect(
			messageToString({ type: 'translation', lines: { en: 'B' } })
		).toBe('B')
		expect(messageToString({ type: 'text', text: 'строка' })).toBe('строка')
		expect(messageToString({ type: 'text', text: '  ' })).toBeNull()
	})
})

describe('statusName', () => {
	test('maps bind states to russian labels', () => {
		expect(statusName({ state: 'PERSONAL_ON_USE' })).toBe(
			'Привязывается при использовании'
		)
		expect(statusName('NONE')).toBe('Не привязан')
		expect(statusName('unknown_state')).toBeNull()
		expect(statusName(undefined)).toBeNull()
	})
})

describe('renderItemDetail', () => {
	const card = renderItemDetail(weapon)

	test('bold name, status and visible sections', () => {
		expect(card.text).toContain('АКС-74У')
		expect(card.text).toContain('Ранг: Отмычка')
		expect(card.text).toContain('Класс: Автоматы')
		expect(card.text).not.toContain('Прочность')
		expect(card.text).toContain('Вес: 2,71 кг')
		expect(card.text).toContain('Дистанция: 10 — 120.50')
		expect(card.text).toContain('Урон')
		expect(card.text).toContain('17.70 → 12.80 на 120 м')
		expect(card.text).toContain('Описание')
	})

	test('uses mono entities for expandable blockquote sections', () => {
		const types = card.entities.map((entity) => entity.type)
		expect(types).toContain('bold')
		expect(types).toContain('expandable_blockquote')
	})

	test('caps at telegram message limit', () => {
		const long: ItemDetail = {
			infoBlocks: Array.from({ length: 40 }, (_, index) => ({
				type: 'list',
				title: {
					type: 'text',
					text: `Секция ${index} — ${'x'.repeat(200)}`,
				},
				elements: Array.from({ length: 10 }, () => ({
					type: 'key-value',
					key: { type: 'text', text: 'Ключ' },
					value: { type: 'text', text: 'значение'.repeat(20) },
				})),
			})),
		}
		const limited = renderItemDetail(long)
		expect(limited.text.length).toBeLessThanOrEqual(4096)
	})

	test('falls back to provided name', () => {
		const card = renderItemDetail({}, { fallbackName: 'АКС' })
		expect(card.text).toContain('АКС')
	})
})

describe('ItemDetailCache', () => {
	const payload = weapon

	function database(fails = 0): {
		cache: ItemDetailCache
		calls: () => number
	} {
		let calls = 0
		const fetchImpl = Object.assign(
			async (): Promise<Response> => {
				calls += 1
				if (calls <= fails) return new Response('boom', { status: 503 })
				return new Response(JSON.stringify(payload), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
			},
			{ preconnect: (): void => undefined }
		)
		const cache = new ItemDetailCache({
			dbUrl: 'https://cdn.stalhub.dev/db',
			webAppUrl: 'https://stalhub.dev',
			requestTimeoutMs: 1000,
			fetchImpl: fetchImpl as typeof fetch,
		})
		return { cache, calls: () => calls }
	}

	test('fetches once per key and returns the detail', async () => {
		const { cache, calls } = database()
		const first = await cache.detail('weapon/assault_rifle', 'aksu')
		const second = await cache.detail('weapon/assault_rifle', 'aksu')
		expect(calls()).toBe(1)
		expect(second.text).toBe(first.text)
		expect(first.pageUrl).toBe(
			'https://stalhub.dev/items/weapon/assault_rifle/aksu'
		)
	})

	test('deduplicates concurrent fetches for the same key', async () => {
		const { cache, calls } = database()
		const [one, two] = await Promise.all([
			cache.get('other', 'qyvk'),
			cache.get('other', 'qyvk'),
		])
		expect(one).toBe(two)
		expect(calls()).toBe(1)
	})

	test('does not cache failures', async () => {
		const { cache, calls } = database(1)
		await expect(cache.get('other', 'qyvk')).rejects.toMatchObject({
			name: 'DetailLoadError',
		})
		const detail = await cache.get('other', 'qyvk')
		expect(calls()).toBe(2)
		expect(detail.id).toBe('aksu')
	})

	test('caches 404 misses for a short window', async () => {
		let calls = 0
		const fetchImpl = Object.assign(
			async (): Promise<Response> => {
				calls += 1
				return new Response('nf', { status: 404 })
			},
			{ preconnect: (): void => undefined }
		)
		const cache = new ItemDetailCache({
			dbUrl: 'https://cdn.stalhub.dev/db',
			webAppUrl: 'https://stalhub.dev',
			requestTimeoutMs: 1000,
			fetchImpl: fetchImpl as typeof fetch,
		})
		await expect(cache.get('other', 'gone')).rejects.toMatchObject({
			status: 404,
		})
		await expect(cache.get('other', 'gone')).rejects.toMatchObject({
			status: 404,
		})
		expect(calls).toBe(1)
	})
})

describe('block helpers', () => {
	test('show-all-toggle blocks are ignored', () => {
		const blocks: ItemBlock[] = [{ type: 'show-all-toggle' }]
		const card = renderItemDetail(
			{ infoBlocks: blocks },
			{ fallbackName: 'X' }
		)
		expect(card.text).toBe('X')
	})
})
