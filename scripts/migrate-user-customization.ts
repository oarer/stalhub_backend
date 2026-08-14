// migrate for prod
// bg_* remove after migration

import { BgVariant, type CardBackground } from 'generated/prisma/enums'
import { prisma } from '@/lib/prisma'

async function main() {
	const users = await prisma.user.findMany({
		include: { UserSettings: true },
	})

	let created = 0
	let updated = 0
	let skipped = 0

	for (const user of users) {
		const settings = user.UserSettings
		const data = {
			cardColor: settings?.bg_color ?? '#171717',
			cardBackground: (settings?.bg_variant ??
				BgVariant.NONE) as CardBackground,
			avatar: settings?.avatar ?? null,
		}

		const existing = await prisma.userCustomization.findUnique({
			where: { userId: user.id },
		})

		if (existing) {
			const needsUpdate =
				existing.cardColor !== data.cardColor ||
				existing.cardBackground !== data.cardBackground ||
				existing.avatar !== data.avatar
			if (!needsUpdate) {
				skipped++
				continue
			}
			await prisma.userCustomization.update({
				where: { userId: user.id },
				data,
			})
			updated++
		} else {
			await prisma.userCustomization.create({
				data: { userId: user.id, ...data },
			})
			created++
		}
	}

	console.log(
		`[migrate] done: ${created} created, ${updated} updated, ${skipped} unchanged`
	)
}

main()
	.catch((err) => {
		console.error('[migrate] failed:', err)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
