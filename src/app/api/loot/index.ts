import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { env } from '@/env'
import { createElysia } from '@/utils/elysia'
import { buildCatalog } from './catalog'
import { type EncryptedPayload, encryptBuffer } from './crypto'
import { parseJsonObject } from './parse-json'

let catalog: EncryptedPayload | null = null
let catalogBuildError: string | null = null

function buildFromSources(): boolean {
	const sources = {
		lootDir: env.LOOT_SOURCE_DIR,
		shufflebagsDir: env.LOOT_SHUFFLEBAGS_DIR,
		itemDirs: env.LOOT_ITEMS_DIRS.split(',')
			.map((d) => d.trim())
			.filter(Boolean),
		langDir: env.LOOT_LANG_DIR,
	}

	if (!sources.lootDir || !existsSync(sources.lootDir)) {
		return false
	}

	try {
		const result = buildCatalog(sources)
		catalogBuildError = null

		const json = JSON.stringify(result.catalog)
		const payload = encryptBuffer(Buffer.from(json, 'utf8'), env.LOOT_KEY)
		catalog = payload

		const outDir = env.LOOT_OUT_DIR
		if (outDir) {
			mkdirSync(outDir, { recursive: true })
			writeFileSync(join(outDir, 'catalog.json'), json, 'utf8')
			writeFileSync(
				join(outDir, 'catalog.enc'),
				JSON.stringify(payload),
				'utf8'
			)
		}

		console.log(
			`[loot] catalog built: ${result.sourceFileCount} files, ` +
				`${result.tableCount} tables, ${result.slotCount} slots, ${result.itemCount} items`
		)
		return true
	} catch (error) {
		catalogBuildError =
			error instanceof Error ? error.message : String(error)
		console.error('[loot] catalog build failed:', catalogBuildError)
		return false
	}
}

function loadFromEncrypted(): boolean {
	if (!env.LOOT_KEY || !env.LOOT_OUT_DIR) {
		return false
	}

	const encFile = join(env.LOOT_OUT_DIR, 'catalog.enc')
	if (!existsSync(encFile)) {
		return false
	}

	try {
		catalog = parseJsonObject<EncryptedPayload>(
			readFileSync(encFile, 'utf8')
		)
		catalogBuildError = null
		console.log(`[loot] encrypted catalog loaded from ${encFile}`)
		return true
	} catch (error) {
		catalogBuildError =
			error instanceof Error ? error.message : String(error)
		console.error(
			'[loot] encrypted catalog parse failed:',
			catalogBuildError
		)
		return false
	}
}

export const routeLoot = createElysia()
	.onStart(() => {
		if (!buildFromSources()) {
			loadFromEncrypted()
		}
	})
	.get('/loot', ({ set }) => {
		if (!catalog) {
			set.status = 503
			return {
				error: 'loot catalog not available',
				details: catalogBuildError,
			}
		}

		set.headers['Cache-Control'] = 'public, max-age=3600'
		return catalog
	})
