import { Database } from 'bun:sqlite'
import { mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

export type AssetRow = {
	path: string
	offset: number
	bytes: number
	sha256: string
	mime: string
	encoding: string
	cache: string
}
export const bundleSchema = 1
const sizes = new Set([32, 64, 128, 256])
const textures = new Set([
	'texture',
	'sr-texture',
	'sr-texture-hd',
	'model-texture',
])
export class MapError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message)
	}
}
function integer(
	value: string | null,
	min: number,
	max: number,
	fallback: number
) {
	if (value === null) return fallback
	if (
		!/^\d+$/.test(value) ||
		!Number.isSafeInteger(+value) ||
		+value < min ||
		+value > max
	)
		throw new MapError(400, 'Invalid numeric parameter')
	return +value
}
// Compiled Bun modules share the executable's import.meta URL. The explicit
// worker entrypoint keeps its source-tree path inside the executable.
function searchWorkerUrl() {
	return new URL(
		import.meta.url.endsWith('/bundle.ts')
			? './search.worker.ts'
			: './src/app/api/map3d/search.worker.ts',
		import.meta.url
	).href
}
export function assetKey(resource: string, url: URL) {
	const p = new URLSearchParams(),
		input = url.searchParams
	if (
		textures.has(resource) ||
		['model', 'model-raw', 'model-material'].includes(resource)
	) {
		const name = input.get('name') ?? ''
		if (
			!/^[\w]+:[\p{L}\p{N}_./ ()'-]+$/u.test(name) ||
			name
				.split(':')[1]
				.split('/')
				.some((s) => !s || s.endsWith('.') || s.endsWith(' ')) ||
			/\.xeon$/i.test(name)
		)
			throw new MapError(400, 'Invalid resource name')
		p.set('name', name)
		if (resource === 'model-material' && input.has('slug'))
			p.set('slug', input.get('slug')!)
		if (textures.has(resource)) {
			if (input.has('max_size')) {
				const size = integer(input.get('max_size'), 32, 256, 256)
				if (!sizes.has(size))
					throw new MapError(400, 'Invalid texture cap')
				p.set('max_size', String(size))
			} else if (input.has('mip')) {
				const mip = integer(input.get('mip'), 0, 19, 0)
				if (mip) p.set('mip', String(mip))
			}
		}
	}
	if (resource.includes('/terrain-lod/') && !resource.endsWith('/manifest')) {
		if (input.has('step')) {
			if (!resource.includes('/regions/') || input.has('colors'))
				throw new MapError(400, 'Invalid LOD profile')
			const step = integer(input.get('step'), 1, 16, 1),
				revision = input.get('revision') ?? ''
			if (
				![1, 2, 4, 8, 16].includes(step) ||
				!/^[a-f\d]{20}$/i.test(revision)
			)
				throw new MapError(400, 'Invalid surface LOD profile')
			p.set('step', String(step))
			p.set('revision', revision)
		} else if (input.has('colors')) {
			const colors = integer(input.get('colors'), 32, 64, 32)
			if (!resource.includes('/regions/') || ![32, 64].includes(colors))
				throw new MapError(400, 'Invalid LOD colour profile')
			p.set('colors', String(colors))
		}
	}
	p.sort()
	return resource + (p.size ? '?' + p.toString() : '')
}

export class MapNotes {
	private notes?: Database
	constructor(
		private notesPath: string,
		private validate: (slug: string) => void
	) {}
	close() {
		this.notes?.close()
	}
	private json(value: unknown, status = 200, head = false) {
		return new Response(head ? null : JSON.stringify(value), {
			status,
			headers: {
				'content-type': 'application/json',
				'cache-control': 'no-store',
				'Cross-Origin-Resource-Policy': 'same-origin',
			},
		})
	}
	private notesDb() {
		if (!this.notes) {
			mkdirSync(dirname(resolve(this.notesPath)), { recursive: true })
			this.notes = new Database(this.notesPath, { create: true })
			this.notes.exec(
				'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, data TEXT NOT NULL)'
			)
		}
		return this.notes
	}
	async handleNotes(request: Request, id?: string) {
		const db = this.notesDb(),
			head = request.method === 'HEAD'
		if (['GET', 'HEAD'].includes(request.method) && !id)
			return this.json(
				db
					.query('SELECT data FROM notes ORDER BY rowid')
					.all()
					.map((row) => JSON.parse((row as { data: string }).data)),
				200,
				head
			)
		if (request.method === 'DELETE' && id) {
			if (!/^[a-f\d-]{36}$/i.test(id))
				throw new MapError(400, 'Invalid note id')
			db.query('DELETE FROM notes WHERE id=?').run(id)
			return new Response(null, { status: 204 })
		}
		if (request.method !== 'POST' || id)
			throw new MapError(405, 'Method not allowed')
		// Bound the stream before parsing, including requests without Content-Length.
		const reader = request.body?.getReader()
		const parts: Uint8Array[] = []
		let size = 0
		if (reader)
			try {
				for (;;) {
					const { value, done } = await reader.read()
					if (done) break
					size += value.length
					if (size > 65536) {
						await reader.cancel()
						throw new MapError(413, 'Note body too large')
					}
					parts.push(value)
				}
			} finally {
				reader.releaseLock()
			}
		const bytes = new Uint8Array(size)
		let offset = 0
		for (const part of parts) {
			bytes.set(part, offset)
			offset += part.length
		}
		let note: Record<string, unknown>
		try {
			note = JSON.parse(new TextDecoder().decode(bytes))
		} catch {
			throw new MapError(400, 'Invalid JSON')
		}
		if (
			!note ||
			typeof note.id !== 'string' ||
			!/^[a-f\d-]{36}$/i.test(note.id) ||
			typeof note.instance !== 'string' ||
			!['object', 'block', 'point', 'area'].includes(String(note.kind)) ||
			typeof note.text !== 'string' ||
			!note.text.trim() ||
			note.text.length > 5000 ||
			!['x', 'y', 'z'].every(
				(k) => typeof note[k] === 'number' && Number.isFinite(note[k])
			)
		)
			throw new MapError(400, 'Invalid note')
		this.validate(note.instance)
		const save = db.transaction(() => {
			if (
				!db
					.query('SELECT 1 FROM notes WHERE id=?')
					.get(note.id as string) &&
				(
					db.query('SELECT count(*) AS n FROM notes').get() as {
						n: number
					}
				).n >= 5000
			)
				throw new MapError(400, 'Note limit reached')
			db.query(
				'INSERT INTO notes(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'
			).run(note.id as string, JSON.stringify(note))
		})
		save()
		return this.json(note)
	}
}

/** Immutable prepared data. No game files, conversions, subprocesses or HTTP upstream. */
export class MapBundle {
	readonly db: Database
	readonly root: string
	readonly revision: string
	readonly version: number
	private notesStore?: MapNotes
	private paths = new Map<string, string>()
	constructor(
		root: string,
		private notesPath: string
	) {
		this.root = realpathSync(resolve(root))
		this.db = new Database(resolve(this.root, 'map3d.sqlite'), {
			readonly: true,
		})
		try {
			const meta = this.db.query('SELECT value FROM meta WHERE key=?')
			if (
				Number((meta.get('schema') as { value: string })?.value) !==
				bundleSchema
			)
				throw Error('Unsupported map bundle schema')
			this.revision = (meta.get('revision') as { value: string }).value
			this.version = Number(
				(meta.get('version') as { value: string }).value
			)
		} catch (e) {
			this.db.close()
			throw e
		}
	}
	close() {
		this.worker?.terminate()
		for (const job of this.jobs.values())
			job.reject(Error('Map bundle closed'))
		this.jobs.clear()
		this.db.close()
		this.notesStore?.close()
	}
	private json(value: unknown, status = 200, head = false) {
		return new Response(head ? null : JSON.stringify(value), {
			status,
			headers: {
				'content-type': 'application/json',
				'cache-control': 'no-store',
				'Cross-Origin-Resource-Policy': 'same-origin',
			},
		})
	}
	private instance(slug: string) {
		const row = this.db
			.query('SELECT status FROM instances WHERE slug=?')
			.get(slug) as { status: string } | null
		if (!row) throw new MapError(404, 'Instance missing')
		return JSON.parse(row.status)
	}
	private filePath(path: string) {
		let full = this.paths.get(path)
		if (full) return full
		if (
			isAbsolute(path) ||
			path.split(/[\\/]/).some((p) => !p || p === '.' || p === '..') ||
			/\.xeon$/i.test(path)
		)
			throw Error('Invalid bundle file')
		full = realpathSync(resolve(this.root, path))
		const rel = relative(this.root, full)
		if (rel.startsWith('..') || isAbsolute(rel))
			throw Error('Bundle file escapes root')
		this.paths.set(path, full)
		return full
	}
	private async asset(request: Request, row: AssetRow) {
		const tag = '"' + row.sha256 + '"',
			headers = new Headers({
				'content-type': row.mime,
				etag: tag,
				'cache-control': row.cache,
				'accept-ranges': 'bytes',
				'Cross-Origin-Resource-Policy': 'same-origin',
			})
		if (
			request.headers
				.get('if-none-match')
				?.split(',')
				.some((x) => x.trim() === tag || x.trim() === '*')
		)
			return new Response(null, { status: 304, headers })
		const file = Bun.file(this.filePath(row.path))
		if (
			row.offset < 0 ||
			row.bytes < 0 ||
			row.offset + row.bytes > file.size
		)
			throw Error('Truncated bundle pack')
		let first = 0,
			last = row.bytes - 1,
			status = 200
		const range = request.headers.get('range')
		if (
			range &&
			(!request.headers.has('if-range') ||
				request.headers.get('if-range') === tag)
		) {
			const match = /^bytes=(\d*)-(\d*)$/.exec(range)
			if (!match || (!match[1] && !match[2]))
				return new Response(null, {
					status: 416,
					headers: { 'content-range': `bytes */${row.bytes}` },
				})
			if (match[1]) {
				first = Number(match[1])
				last = match[2] ? Math.min(last, Number(match[2])) : last
			} else first = Math.max(0, row.bytes - Number(match[2]))
			if (
				!Number.isSafeInteger(first) ||
				!Number.isSafeInteger(last) ||
				first > last ||
				first >= row.bytes
			)
				return new Response(null, {
					status: 416,
					headers: { 'content-range': `bytes */${row.bytes}` },
				})
			status = 206
			headers.set('content-range', `bytes ${first}-${last}/${row.bytes}`)
		}
		if (row.encoding) headers.set('content-encoding', row.encoding)
		headers.set('content-length', String(Math.max(0, last - first + 1)))
		return new Response(
			request.method === 'HEAD'
				? null
				: file
						.slice(row.offset + first, row.offset + last + 1)
						.stream(),
			{ status, headers }
		)
	}
	async handle(request: Request, resource: string): Promise<Response> {
		try {
			if (
				!resource ||
				resource
					.split('/')
					.some(
						(p) =>
							!p ||
							p === '.' ||
							p === '..' ||
							/[\\?#%\x00]/.test(p)
					)
			)
				throw new MapError(404, 'Resource missing')
			const url = new URL(request.url),
				head = request.method === 'HEAD',
				parts = resource.split('/')
			if (parts[0] === 'notes' && parts.length <= 2) {
				this.notesStore ??= new MapNotes(this.notesPath, (slug) => {
					this.instance(slug)
				})
				return await this.notesStore.handleNotes(request, parts[1])
			}
			if (
				!['GET', 'HEAD'].includes(request.method) &&
				!(
					request.method === 'POST' &&
					/^instances\/[^/]+\/open$/.test(resource)
				)
			)
				throw new MapError(405, 'Method not allowed')
			if (resource === 'health')
				return this.json(
					{
						ok: true,
						schema: bundleSchema,
						revision: this.revision,
						runtime: 'stalhub',
					},
					200,
					head
				)
			if (parts[0] === 'instances' && parts.length >= 3) {
				const slug = parts[1],
					status = this.instance(slug),
					kind = parts[2]
				if (parts.length === 3 && ['open', 'status'].includes(kind))
					return this.json(status, 200, head)
				if (parts.length === 3 && kind === 'changes') {
					const since = integer(
						url.searchParams.get('since'),
						0,
						Number.MAX_SAFE_INTEGER,
						0
					)
					const chunks =
						since === this.version
							? []
							: JSON.parse(
									(
										this.db
											.query(
												'SELECT chunks FROM instances WHERE slug=?'
											)
											.get(slug) as { chunks: string }
									).chunks
								)
					return this.json(
						{ version: this.version, chunks },
						200,
						head
					)
				}
				if (parts.length === 3 && kind === 'object-definition') {
					const id = integer(url.searchParams.get('id'), 0, 65535, -1)
					if (id < 0) throw new MapError(400, 'Missing object id')
					const uuid = url.searchParams.get('uuid')
					let row: unknown
					if (uuid && /^[a-f\d]{32}$/i.test(uuid))
						row = this.db
							.query(
								'SELECT metadata FROM objects WHERE slug=? AND uuid=? ORDER BY seq DESC LIMIT 1'
							)
							.get(slug, uuid.toLowerCase())
					row ??= this.db
						.query(
							'SELECT metadata FROM definitions WHERE slug=? AND id=? AND ambiguous=0'
						)
						.get(slug, String(id))
					return this.json(
						row
							? JSON.parse((row as { metadata: string }).metadata)
							: null,
						200,
						head
					)
				}
				if (parts.length === 3 && kind === 'search')
					return this.json(await this.search(slug, url), 200, head)
			}
			let key = assetKey(
				resource === 'model' ? 'model-raw' : resource,
				url
			)
			let row = this.db
				.query('SELECT * FROM assets WHERE key=?')
				.get(key) as AssetRow | null
			if (
				!row &&
				resource === 'model-material' &&
				url.searchParams.has('slug')
			) {
				url.searchParams.delete('slug')
				key = assetKey(resource, url)
				row = this.db
					.query('SELECT * FROM assets WHERE key=?')
					.get(key) as AssetRow | null
			}
			if (!row) throw new MapError(404, 'Prepared resource missing')
			return await this.asset(request, row)
		} catch (e) {
			if (e instanceof MapError)
				return this.json(
					{ error: e.message },
					e.status,
					request.method === 'HEAD'
				)
			console.error('Map bundle request failed', e)
			return this.json(
				{ error: 'Prepared map data is unavailable' },
				503,
				request.method === 'HEAD'
			)
		}
	}
	// Search runs in a persistent worker so a large map cannot stall asset delivery.
	private worker?: Worker
	private jobs = new Map<
		number,
		{ resolve: (v: unknown) => void; reject: (e: Error) => void }
	>()
	private sequence = 0
	private search(slug: string, url: URL) {
		const q = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
		if (!q || [...q].length > 200)
			throw new MapError(400, 'Invalid search query')
		const limit = integer(url.searchParams.get('limit'), 0, 100000, 50),
			cursor = integer(
				url.searchParams.get('cursor'),
				0,
				Number.MAX_SAFE_INTEGER,
				0
			)
		if (!this.worker) {
			this.worker = new Worker(searchWorkerUrl())
			this.worker.onmessage = (e) => {
				const job = this.jobs.get(e.data.id)
				if (!job) return
				this.jobs.delete(e.data.id)
				if (e.data.error) job.reject(new MapError(400, e.data.error))
				else job.resolve(e.data.result)
			}
			this.worker.onerror = (e) => {
				for (const job of this.jobs.values())
					job.reject(Error(e.message))
				this.jobs.clear()
				this.worker?.terminate()
				this.worker = undefined
			}
		}
		if (this.jobs.size >= 64) throw new MapError(503, 'Search queue full')
		return new Promise((resolve, reject) => {
			const id = ++this.sequence
			this.jobs.set(id, { resolve, reject })
			this.worker!.postMessage({
				id,
				db: resolvePath(this.root),
				slug,
				q,
				limit: Math.max(1, Math.min(100, limit)),
				cursor,
			})
		})
	}
}
function resolvePath(root: string) {
	return resolve(root, 'map3d.sqlite')
}
let staticNotes: MapNotes | undefined
let staticNotesPath = ''
let current: MapBundle | undefined,
	location = ''
export async function handleMapAsset(request: Request, resource: string) {
	const root =
			process.env.MAP3D_DATA_DIR ??
			resolve(process.cwd(), 'runtime/map3d'),
		notes =
			process.env.MAP3D_NOTES_DB ??
			resolve(process.cwd(), 'runtime/map3d-notes.sqlite')
	try {
		if (process.env.MAP3D_STATIC_MODE === '1') {
			if (!/^notes(?:\/[a-f\d-]{36})?$/i.test(resource))
				return Response.json(
					{ error: 'Map assets are served by the static host' },
					{ status: 404 }
				)
			if (!staticNotes || staticNotesPath !== notes) {
				staticNotes?.close()
				staticNotes = new MapNotes(notes, (slug) => {
					if (!slug || slug.length > 200 || /[\\/\x00]/.test(slug))
						throw new MapError(400, 'Invalid instance')
				})
				staticNotesPath = notes
			}
			return await staticNotes.handleNotes(
				request,
				resource.split('/')[1]
			)
		}
		if (!current || location !== root) {
			current?.close()
			current = new MapBundle(root, notes)
			location = root
		}
		return await current.handle(request, resource)
	} catch (e) {
		if (e instanceof MapError)
			return Response.json({ error: e.message }, { status: e.status })
		console.error('Cannot open prepared map bundle', e)
		return Response.json(
			{ error: 'Пакет данных 3D-карты не установлен' },
			{ status: 503 }
		)
	}
}
