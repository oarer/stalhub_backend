import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { balanceConfig } from './config'
import type { ItemCategory, ItemData } from './types'

export const LISTING_FILES: { file: string; category: ItemCategory }[] = [
	{ file: 'weapons.json', category: 'weapon' },
	{ file: 'armor.json', category: 'armor' },
	{ file: 'artefact.json', category: 'artefact' },
	{ file: 'attachments.json', category: 'attachment' },
	{ file: 'ammo.json', category: 'bullet' },
	{ file: 'consumables.json', category: 'boost' },
	{ file: 'containers.json', category: 'bag' },
]

export type ListingSnapshot = Record<ItemCategory, Record<string, ItemData>>

type RawListing = Record<string, unknown> | unknown[]

export function toItemsMap(raw: RawListing): Record<string, ItemData> {
	if (Array.isArray(raw)) {
		const out: Record<string, ItemData> = {}
		for (const item of raw) {
			const id = (item as { id?: string })?.id
			if (typeof id === 'string' && id) {
				out[id] = item as ItemData
			}
		}
		return out
	}
	return raw as Record<string, ItemData>
}

function downloadUrl(file: string): string {
	const base = balanceConfig.listingUrl.replace(/\/+$/, '')
	return `${base}/${file}`
}

function fallbackUrl(file: string): string {
	return `https://cdn.stalhub.dev/db/listing/${file}`
}

const PROXY_ENV_KEYS = ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY'] as const

function withoutProxyEnv<T>(fn: () => Promise<T>): Promise<T> {
	const saved = new Map<string, string | undefined>()
	for (const key of PROXY_ENV_KEYS) {
		saved.set(key, process.env[key])
		process.env[key] = ''
	}
	const restore = () => {
		for (const [key, value] of saved) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}

	return fn().finally(restore)
}

async function fetchAsJson(url: string): Promise<RawListing> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(30_000),
	})
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} for ${url}`)
	}
	return (await response.json()) as RawListing
}

async function fetchFile(file: string): Promise<RawListing> {
	const urls = [downloadUrl(file), fallbackUrl(file)]
	let lastError: unknown = null

	for (const url of urls) {
		try {
			return await fetchAsJson(url)
		} catch (error) {
			lastError = error
		}

		try {
			return await withoutProxyEnv(() => fetchAsJson(url))
		} catch (error) {
			lastError = error
		}
	}

	throw lastError ?? new Error(`Failed to download ${file}`)
}

export async function downloadListing(): Promise<ListingSnapshot> {
	const files = await Promise.all(
		LISTING_FILES.map(async ({ file, category }) => {
			const raw = await fetchFile(file)
			return [category, toItemsMap(raw)] as const
		})
	)

	return Object.fromEntries(files) as ListingSnapshot
}

const snapshotFileName = (category: ItemCategory) => `${category}.json`

export function saveSnapshot(snapshot: ListingSnapshot): void {
	const { listingDir } = balanceConfig
	mkdirSync(listingDir, { recursive: true })

	for (const { category } of LISTING_FILES) {
		const items = snapshot[category] ?? {}
		writeFileSync(
			join(listingDir, snapshotFileName(category)),
			JSON.stringify(items),
			'utf-8'
		)
	}
}

export function loadSnapshot(): ListingSnapshot {
	const { listingDir } = balanceConfig
	const snapshot = {} as ListingSnapshot

	for (const { category } of LISTING_FILES) {
		try {
			const content = readFileSync(
				join(listingDir, snapshotFileName(category)),
				'utf-8'
			)
			snapshot[category] = JSON.parse(content) as Record<string, ItemData>
		} catch {
			snapshot[category] = {}
		}
	}

	return snapshot
}

export function isSnapshotReady(): boolean {
	const { listingDir } = balanceConfig
	try {
		return existsSync(join(listingDir, snapshotFileName('weapon')))
	} catch {
		return false
	}
}

export function hashSnapshot(snapshot: ListingSnapshot): string {
	const hash = createHash('sha256')
	for (const { category } of LISTING_FILES) {
		const items = snapshot[category] ?? {}
		hash.update(category)
		hash.update(JSON.stringify(items))
	}
	return hash.digest('hex').slice(0, 16)
}
