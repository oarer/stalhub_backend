import { prisma } from '@/lib/prisma'

function decompress(raw: string): unknown {
	if (raw.startsWith('v1:')) {
		const b64 = raw.slice(3)
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
		const json = Bun.inflateSync(bytes)
		return JSON.parse(new TextDecoder().decode(json))
	}
	return JSON.parse(raw)
}

function compress(data: unknown): string {
	const compressed = Bun.deflateSync(
		new TextEncoder().encode(JSON.stringify(data))
	)
	return 'v1:' + Buffer.from(compressed).toString('base64')
}

function migrateArt<T extends Record<string, unknown>>(art: T): Record<string, unknown> {
	const instance_id = art.instance_id ?? art.instanceId
	const selected_stats = art.selected_stats ?? art.selectedStats
	const quality_class = art.quality_class ?? art.qualityClass

	return {
		...art,
		...(instance_id !== undefined && { instance_id }),
		...(selected_stats !== undefined && { selected_stats }),
		...(quality_class !== undefined && { quality_class }),
	}
}

function migrateBuildData(data: unknown): unknown {
	if (!data || typeof data !== 'object') return data
	const build = data as Record<string, unknown>
	if (!Array.isArray(build.arts)) return build
	return {
		...build,
		arts: build.arts.map((art) =>
			art && typeof art === 'object'
				? migrateArt(art as Record<string, unknown>)
				: art
		),
	}
}

async function main() {
	const rows = await prisma.build.findMany({
		select: { id: true, updated_at: true },
	})

	let migrated = 0
	let skipped = 0

	for (const row of rows) {
		const record = await prisma.build.findUnique({
			where: { id: row.id },
			select: { data: true },
		})
		if (!record) continue

		const data = decompress(record.data)
		const migratedData = migrateBuildData(data)

		const before = JSON.stringify(data)
		const after = JSON.stringify(migratedData)

		if (before === after) {
			skipped++
			continue
		}

		await prisma.build.update({
			where: { id: row.id },
			data: { data: compress(migratedData) },
		})
		migrated++
		if (migrated % 100 === 0) {
			console.log(`[migrate] migrated ${migrated} builds so far...`)
		}
	}

	console.log(
		`[migrate] done: ${migrated} migrated, ${skipped} already snake_case`
	)
}

main()
	.catch((err) => {
		console.error('[migrate] failed:', err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
