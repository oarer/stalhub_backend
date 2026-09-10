/**
 * Create a test user with username/password login.
 *
 * Usage:
 *   bun run scripts/create-test-user.ts <username> <password> [roleName]
 *
 * Examples:
 *   bun run scripts/create-test-user.ts tester pass123
 *   bun run scripts/create-test-user.ts admin_tester pass123 user:manage
 *
 * Arguments:
 *   username   — username (обязательно)
 *   password   — password (обязательно)
 *   roleName   — роль по названию (подключается к юзеру). "user:manage" — права админа. optional
 *
 * Note: роль берётся по ТОЧНОМУ названию. Роли для админки создаются через админку,
 * права висят на ролях, а не на юзере напрямую.
 */

export {}

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/utils/crypto'

const [username, password, roleName] = process.argv.slice(2)

if (!username || !password) {
	console.error(
		'Usage: bun run scripts/create-test-user.ts <username> <password> [roleName]'
	)
	console.error(
		'  roleName: роль по названию, например "user:manage" — права админа'
	)
	process.exit(1)
}

const existing = await prisma.user.findFirst({
	where: { username: { equals: username, mode: 'insensitive' } },
})
if (existing) {
	console.error(`User "${username}" already exists (id=${existing.id})`)
	process.exit(1)
}

async function ensureRole(name: string) {
	const role = await prisma.role.findUnique({ where: { name } })
	if (!role) {
		console.error(`Role "${name}" not found. Available roles:`)
		const roles = await prisma.role.findMany({ orderBy: { rank: 'asc' } })
		roles.forEach((r) => console.log(`  ${r.name} (rank ${r.rank})`))
		process.exit(1)
	}
	return role
}

const userRole = await ensureRole('user')

const user = await prisma.user.create({
	data: {
		username,
		name: username,
		password_hash: hashPassword(password),
		roles: { connect: [{ id: userRole.id }] },
	},
})

if (roleName) {
	const extra = await ensureRole(roleName)
	await prisma.user.update({
		where: { id: user.id },
		data: { roles: { connect: [{ id: extra.id }] } },
	})
}

console.log('Test user created:')
console.log(`  id:       ${user.id}`)
console.log(`  username: ${username}`)
console.log(`  password: ${password}`)
console.log(
	`  roles:    ${[userRole.name, roleName].filter(Boolean).join(', ')}`
)

await prisma.$disconnect()
