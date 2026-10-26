import { describe, expect, test } from 'bun:test'
import {
	ItemDatabase,
	normalizeItemName,
	parseListing,
	rankName,
	rankPriority,
	searchItems,
	type ListedItem,
} from '../src/items'

const entry = (
	category: string,
	id: string,
	ru: string,
	en: string,
	color = 'DEFAULT'
) => ({
	data: `/items/${category}/${id}.json`,
	icon: `/icons/${category}/${id}.png`,
	name: { ru, en },
	color,
})

const dbUrl = 'https://cdn.stalhub.dev/db'
const webAppUrl = 'https://stalhub.dev'

const listing = [
	entry('other', 'qyvk', '«Вспышка»', 'Flare', 'RANK_MASTER'),
	entry('supply/medicine', '9mmq', 'Мякоть солевика', 'Saltweed Pulp'),
	entry('supply/medicine', '1ddr', 'Мякоть мятноплода', 'Mintfruit Pulp'),
	entry('arms', 'ak', 'АК «Ржавый»', 'AK Rusty', 'RANK_LEGEND'),
]

const parsedListing = parseListing(listing, { dbUrl, webAppUrl })

describe('normalizeItemName', () => {
	test('lowercases, strips book quotes and collapses whitespace', () => {
		expect(normalizeItemName('  «ВспЫшка» ')).toBe('вспышка')
		expect(normalizeItemName("AK  'Rusty'")).toBe('ak rusty')
	})
})

describe('rank helpers', () => {
	test('maps colors to russian rank names and priorities', () => {
		expect(rankName('RANK_LEGEND')).toBe('Легенда')
		expect(rankName('quest_item')).toBe('Квестовый предмет')
		expect(rankName('DEFAULT')).toBeNull()
		expect(rankPriority('rank_legend')).toBe(5)
		expect(rankPriority('default')).toBe(0)
	})
})

describe('parseListing', () => {
	test('extracts categories, ids, icon and page urls', () => {
		const [flare] = parsedListing
		expect(flare.category).toBe('other')
		expect(flare.id).toBe('qyvk')
		expect(flare.iconUrl).toBe(`${dbUrl}/icons/other/qyvk.png`)
		expect(flare.pageUrl).toBe(`${webAppUrl}/items/other/qyvk`)
	})

	test('skips malformed entries and tolerates missing fields', () => {
		const parsed = parseListing(
			[{ data: 'not-an-item.json' }, {}, { data: '/items/other/qyvk.json' }],
			{ dbUrl, webAppUrl }
		)
		expect(parsed).toHaveLength(1)
		expect(parsed[0].color).toBe('DEFAULT')
		expect(parsed[0].iconUrl).toBeNull()
	})

	test('throws when payload is not an array', () => {
		expect(() => parseListing({}, { dbUrl, webAppUrl })).toThrow(
			'Listing payload is not an array'
		)
	})
})

describe('searchItems', () => {
	test('matches by russian prefix ignoring quotes', () => {
		const results = searchItems(parsedListing, 'вспы')
		expect(results.map((item: ListedItem) => item.id)).toEqual(['qyvk'])
	})

	test('matches by english name as well', () => {
		const results = searchItems(parsedListing, 'saltweed')
		expect(results.map((item) => item.id)).toEqual(['9mmq'])
	})

	test('ranks higher rarity first and prefix matches before substring matches', () => {
		const entries = parseListing(
			[
				entry('arms', 'low', 'Вспышка малая', 'Flare Small'),
				entry('arms', 'high', 'Вспышка', 'Flare', 'RANK_LEGEND'),
			],
			{ dbUrl, webAppUrl }
		)
		const results = searchItems(entries, 'вспышка')
		expect(results.map((item) => item.id)).toEqual(['high', 'low'])
	})

	test('returns at most the requested amount', () => {
		const entries = parseListing(
			[1, 2, 3].map((n) => entry('arms', `w${n}`, `Оружие ${n}`, `Weapon ${n}`)),
			{ dbUrl, webAppUrl }
		)
		expect(searchItems(entries, 'оружие', 2)).toHaveLength(2)
	})

	test('returns nothing for queries without matches', () => {
		expect(searchItems(parsedListing, 'болт')).toEqual([])
	})
})

describe('ItemDatabase', () => {
	const payload = listing

	function ok(): Response {
		return new Response(JSON.stringify(payload), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		})
	}

	function database(
		itemsRefreshMs = 3_600_000,
		fetchImpl: (calls: number) => Response = () => ok()
	): { db: ItemDatabase; calls: () => number } {
		let calls = 0
		const stub = Object.assign(
			async (): Promise<Response> => fetchImpl(++calls),
			{ preconnect: (): void => undefined }
		)
		const db = new ItemDatabase({
			dbUrl,
			webAppUrl,
			requestTimeoutMs: 1_000,
			itemsRefreshMs,
			fetchImpl: stub as typeof fetch,
		})
		return { db, calls: () => calls }
	}

	test('loads the catalog lazily and serves searches', async () => {
		const { db, calls } = database()
		const results = await db.search('вспы')
		expect(calls()).toBe(1)
		expect(results.map((item) => item.id)).toEqual(['qyvk'])
	})

	test('does not refetch while the catalog is fresh', async () => {
		const { db, calls } = database()
		await db.search('вспы')
		await db.search('мякоть')
		expect(calls()).toBe(1)
	})

	test('throws DbLoadError to the caller when the first load fails', async () => {
		const { db } = database(3_600_000, () => new Response('boom', { status: 503 }))
		await expect(db.search('вспы')).rejects.toMatchObject({
			name: 'DbLoadError',
			status: 503,
		})
	})

	test('keeps the previous catalog when a background refresh fails', async () => {
		const { db, calls } = database(
			0,
			(n) => (n === 1 ? ok() : new Response('boom', { status: 503 }))
		)
		await db.search('вспы')
		const second = await db.search('вспы')
		expect(calls()).toBe(2)
		expect(second.map((item) => item.id)).toEqual(['qyvk'])
	})
})
