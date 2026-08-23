import { prisma } from '@/lib/prisma'

async function main() {
	const users = await prisma.user.findMany({ select: { id: true } })

	let created = 0
	let updated = 0
	let skipped = 0

	for (const user of users) {
		const data = {
			card_color: '#171717',
			card_background: 'NONE' as const,
			avatar: null,
		}

		const existing = await prisma.userCustomization.findUnique({
			where: { user_id: user.id },
		})

		if (existing) {
			const needsUpdate =
				existing.card_color !== data.card_color ||
				existing.card_background !== data.card_background ||
				existing.avatar !== data.avatar
			if (!needsUpdate) {
				skipped++
				continue
			}
			await prisma.userCustomization.update({
				where: { user_id: user.id },
				data,
			})
			updated++
		} else {
			await prisma.userCustomization.create({
				data: { user_id: user.id, ...data },
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
