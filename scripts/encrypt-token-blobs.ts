import { prisma } from '@/lib/prisma'
import { encryptSecret, isEncrypted } from '@/utils/crypto'

async function main() {
	const rows = await prisma.eXBOAuth.findMany({
		select: { id: true, exbo_id: true, token_blob: true },
	})

	let encrypted = 0
	let skipped = 0

	for (const row of rows) {
		if (isEncrypted(row.token_blob)) {
			skipped++
			continue
		}

		await prisma.eXBOAuth.update({
			where: { id: row.id },
			data: { token_blob: encryptSecret(row.token_blob) },
		})
		encrypted++
		console.log(`[migrate] encrypted token_blob for EXBO account ${row.exbo_id}`)
	}

	console.log(`[migrate] done: ${encrypted} encrypted, ${skipped} already encrypted`)
}

main()
	.catch((err) => {
		console.error('[migrate] failed:', err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
