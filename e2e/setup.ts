import { hashPassword } from '../src/utils/crypto'

const url = new URL(process.env.DATABASE_URL ?? '')
if (
	process.env.STALHUB_E2E !== '1' ||
	!['127.0.0.1', 'localhost'].includes(url.hostname) ||
	url.pathname !== '/stalhub_e2e'
)
	throw new Error('Disposable E2E database required')
for (const command of [['migrate', 'deploy'], ['generate']]) {
	const result = Bun.spawnSync(
		['bun', '--no-env-file', 'x', '--no-install', 'prisma', ...command],
		{ stdout: 'inherit', stderr: 'inherit' }
	)
	if (result.exitCode !== 0)
		throw new Error(`E2E Prisma ${command.join(' ')} failed`)
}
const { prisma } = await import('../src/lib/prisma')
try {
	const permission = await prisma.permission.upsert({
		where: { name: 'art:author' },
		create: { name: 'art:author' },
		update: {},
	})
	const arbitration = await prisma.permission.findUniqueOrThrow({
		where: { name: 'commission:arbitrate' },
	})
	const author = await prisma.role.upsert({
		where: { name: 'author' },
		create: {
			name: 'author',
			permissions: { connect: { id: permission.id } },
		},
		update: { permissions: { connect: { id: permission.id } } },
	})
	const arbiter = await prisma.role.upsert({
		where: { name: 'arbiter' },
		create: {
			name: 'arbiter',
			permissions: { connect: { id: arbitration.id } },
		},
		update: {},
	})
	for (const username of [
		'e2e_owner',
		'e2e_other',
		'e2e_artist',
		'e2e_arbiter',
	]) {
		await prisma.user.upsert({
			where: { username },
			create: {
				username,
				name: username,
				onboarded: true,
				password_hash: hashPassword('E2E-only-password-123!'),
				user_settings: { create: { public_profile: true } },
				customization: { create: {} },
				roles:
					username === 'e2e_owner' || username === 'e2e_artist'
						? { connect: { id: author.id } }
						: username === 'e2e_arbiter'
							? { connect: { id: arbiter.id } }
							: undefined,
			},
			update: {},
		})
	}
	const artist = await prisma.user.findUniqueOrThrow({
		where: { username: 'e2e_artist' },
	})
	await prisma.art.upsert({
		where: { external_id: 'e2e-artist-portfolio' },
		create: {
			external_id: 'e2e-artist-portfolio',
			author_id: artist.id,
			title: 'Portfolio sample',
			image_url:
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
		},
		update: {},
	})
} finally {
	await prisma.$disconnect()
}
