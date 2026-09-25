export {}

import { createHash } from 'node:crypto'
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import {
	detectImageMime,
	isCompressibleImageMime,
} from '@/utils/image-compress'

const args = process.argv.slice(2)
const has = (flag: string) => args.includes(flag)
const value = (name: string, fallback: string) => {
	const prefix = `--${name}=`
	const found = args.find((a) => a.startsWith(prefix))
	return found ? found.slice(prefix.length) : fallback
}

const APPLY = has('--apply')
const DIRS = value('dirs', 'arts,articles')
	.split(',')
	.map((d) => d.trim())
	.filter(Boolean)
const CONCURRENCY = Math.max(
	1,
	Number.parseInt(value('concurrency', '4'), 10) || 4
)
// Only rewrite when savings are significant. Recompression is not a fixed
// point (especially lossy PNG palette), so without a threshold repeated runs
// would shave off a little more quality every time. First-pass savings are
// typically 10-90%, second-pass shavings <5%.
const MIN_SAVING_PCT = Math.min(
	100,
	Math.max(0, Number.parseFloat(value('min-saving-pct', '5')) || 5)
)
const UPLOADS_ROOT = resolve(process.cwd(), value('uploads', 'uploads'))
const SERVICE_URL = (
	process.env.IMAGE_SERVICE_URL ?? 'http://localhost:3002'
).replace(/\/$/, '')
// Manifest of already-compressed files (path -> sha256 of stored content).
// Recompression is not a fixed point, so re-runs must not touch files whose
// content hasn't changed since the last pass. Dotfile => skipped by walk().
const MANIFEST_NAME = '.compress-manifest.json'
type Manifest = Record<string, { sha256: string; bytes: number }>

const sha256 = (data: Buffer) =>
	createHash('sha256').update(data).digest('hex')

async function loadManifest(): Promise<Manifest> {
	try {
		const raw = await readFile(join(UPLOADS_ROOT, MANIFEST_NAME), 'utf8')
		const parsed = JSON.parse(raw) as unknown
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
			return parsed as Manifest
	} catch {
		// missing or corrupt => start fresh
	}
	return {}
}

async function saveManifest(manifest: Manifest): Promise<void> {
	const path = join(UPLOADS_ROOT, MANIFEST_NAME)
	const tmp = `${path}.${process.pid}.tmp`
	await writeFile(tmp, JSON.stringify(manifest))
	await rename(tmp, path)
}

if (!has('--dry-run') && !APPLY) {
	console.log(
		'Refusing to run without a mode. Use --dry-run (default report) or --apply (rewrite files).'
	)
	process.exit(1)
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue
		const full = join(dir, entry.name)
		if (entry.isDirectory()) await walk(full, out)
		else if (entry.isFile()) out.push(full)
	}
	return out
}

type Stats = {
	scanned: number
	skipped: number
	shrunk: number
	optimal: number
	failed: number
	bytesBefore: number
	bytesAfter: number
}

async function compressOne(
	file: string,
	manifest: Manifest,
	stats: Stats,
	failures: string[]
): Promise<void> {
	stats.scanned++
	let raw: Buffer
	try {
		raw = await readFile(file)
	} catch (err) {
		stats.failed++
		failures.push(`${file}: read failed (${(err as Error).message})`)
		return
	}
	const rel = relative(UPLOADS_ROOT, file)
	if (manifest[rel]?.sha256 === sha256(raw)) {
		stats.optimal++
		return
	}
	const mime = detectImageMime(raw)
	if (!mime || !isCompressibleImageMime(mime)) {
		stats.skipped++
		return
	}
	let res: Response
	try {
		const form = new FormData()
		form.append('file', new Blob([raw], { type: mime }), 'image')
		res = await fetch(`${SERVICE_URL}/compress`, {
			method: 'POST',
			body: form,
			signal: AbortSignal.timeout(60000),
		})
	} catch (err) {
		stats.failed++
		failures.push(`${file}: service unreachable (${(err as Error).message})`)
		return
	}
	if (!res.ok) {
		stats.failed++
		failures.push(`${file}: service responded ${res.status}`)
		return
	}
	const compressed = Buffer.from(await res.arrayBuffer())
	const savedPct = ((raw.length - compressed.length) / raw.length) * 100
	if (compressed.length >= raw.length) {
		// True fixed point: content is untouched, remember it.
		if (APPLY) manifest[rel] = { sha256: sha256(raw), bytes: raw.length }
		stats.optimal++
		return
	}
	if (savedPct < MIN_SAVING_PCT) {
		stats.optimal++
		return
	}
	const pct = Math.round((compressed.length / raw.length) * 100)
	if (!APPLY) {
		stats.shrunk++
		stats.bytesBefore += raw.length
		stats.bytesAfter += compressed.length
		console.log(`[dry-run] ${file}: ${raw.length} -> ${compressed.length} (${pct}%)`)
		return
	}
	try {
		// Atomic replace on the same filesystem: crash-safe, readers never
		// see a half-written file.
		const tmp = `${file}.${process.pid}.tmp`
		await writeFile(tmp, compressed)
		await rename(tmp, file)
		manifest[rel] = { sha256: sha256(compressed), bytes: compressed.length }
		stats.shrunk++
		stats.bytesBefore += raw.length
		stats.bytesAfter += compressed.length
		console.log(`${file}: ${raw.length} -> ${compressed.length} (${pct}%)`)
	} catch (err) {
		stats.failed++
		failures.push(`${file}: replace failed (${(err as Error).message})`)
	}
}

async function main() {
	console.log(
		`Mode: ${APPLY ? 'APPLY (files will be rewritten)' : 'dry-run (report only)'}, ` +
			`dirs: ${DIRS.join(', ')}, concurrency: ${CONCURRENCY}, ` +
			`min-saving: ${MIN_SAVING_PCT}%, service: ${SERVICE_URL}`
	)
	const stats: Stats = {
		scanned: 0,
		skipped: 0,
		shrunk: 0,
		optimal: 0,
		failed: 0,
		bytesBefore: 0,
		bytesAfter: 0,
	}
	const failures: string[] = []

	const files: string[] = []
	for (const dir of DIRS) {
		const abs = join(UPLOADS_ROOT, dir)
		try {
			if ((await stat(abs)).isDirectory()) await walk(abs, files)
			else console.log(`Skip missing dir: ${abs}`)
		} catch {
			console.log(`Skip missing dir: ${abs}`)
		}
	}
	console.log(`Found ${files.length} files`)
	const manifest = await loadManifest()

	let index = 0
	const workers = Array.from(
		{ length: Math.min(CONCURRENCY, Math.max(files.length, 1)) },
		async () => {
			while (index < files.length) {
				const file = files[index++]
				await compressOne(file, manifest, stats, failures)
			}
		}
	)
	await Promise.all(workers)

	if (APPLY) await saveManifest(manifest)

	const saved = stats.bytesBefore - stats.bytesAfter
	console.log(
		`\nDone. scanned=${stats.scanned} shrunk=${stats.shrunk} ` +
			`optimal=${stats.optimal} skipped(gif/video/other)=${stats.skipped} failed=${stats.failed}`
	)
	console.log(
		`Size: ${stats.bytesBefore} -> ${stats.bytesAfter} bytes (saved ${saved}, ` +
			`${stats.bytesBefore ? Math.round((stats.bytesAfter / stats.bytesBefore) * 100) : 100}% of original)`
	)
	if (failures.length) {
		console.log('\nFailures:')
		for (const f of failures.slice(0, 50)) console.log(`  ${f}`)
		if (failures.length > 50) console.log(`  ... and ${failures.length - 50} more`)
		process.exit(1)
	}
}

await main()
