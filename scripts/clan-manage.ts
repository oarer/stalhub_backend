import type { PrismaClient } from 'generated/prisma/client'
import type { ClanService } from '@/app/api/clan/services/clan'

const USER_ID = 1
const DB_URL = 'postgresql://postgres:test1234@localhost:5432/stalhub'

const PLAYERS = [
	{ name: 'JLeLik_BaJLeT', role: 'Полковник' },
	{ name: 'Grandger', role: 'Сержант' },
	{ name: 'Виталя_наво', role: 'Сержант' },
	{ name: 'Teenie', role: 'Сержант' },
	{ name: 'Neonuary', role: 'Сержант' },
	{ name: 'Fac_Tim', role: 'Полковник' },
	{ name: 'ZXC_Zuzii', role: 'Сержант' },
	{ name: 'Максим_В', role: 'Офицер' },
	{ name: 'CKS_Delta', role: 'Офицер' },
	{ name: 'Под_Ликерович', role: 'Сержант' },
	{ name: 'NeV_DeN', role: 'Офицер' },
	{ name: 'Pink_Poffinz', role: 'Сержант' },
	{ name: 'XaGLeZ', role: 'Сержант' },
	{ name: 'АлександрТроянов', role: 'Сержант' },
	{ name: 'Nagibay_rakov', role: 'Сержант' },
	{ name: 'ЭТО_', role: 'Сержант' },
	{ name: 'Турбовоздухан', role: 'Сержант' },
	{ name: 'Mikosha_tyan', role: 'Сержант' },
	{ name: 'Младший_ЧеЛоВеКк', role: 'Офицер' },
	{ name: 'Тодо_бесто_френд', role: 'Сержант' },
	{ name: 'Небо_Вогне', role: 'Офицер' },
	{ name: 'TAfonyzic', role: 'Сержант' },
	{ name: 'Гидромен', role: 'Сержант' },
	{ name: 'ЛедорубГроцкого', role: 'Офицер' },
]

const ROLE_TO_RANK: Record<string, string> = {
	Полковник: 'COLONEL',
	Офицер: 'OFFICER',
	Сержант: 'SERGEANT',
}

let prisma: PrismaClient
let clanService: ClanService

async function init() {
	process.env.DATABASE_URL = DB_URL
	const lib = await import('@/lib/prisma')
	const clan = await import('@/app/api/clan/services/clan')
	prisma = lib.prisma
	clanService = clan.clanService
}

async function showStatus() {
	const profile = await prisma.userClanProfile.findUnique({
		where: { userId: USER_ID },
		include: { clan: { include: { members: true } } },
	})
	if (!profile) {
		console.log('User 1: no clan profile')
		return
	}
	console.log('=== User 1 Clan Profile ===')
	console.log(`  Region: ${profile.region}`)
	console.log(`  Clan ID: ${profile.clanId ?? 'none'}`)
	if (profile.clan) {
		console.log(`  Clan name: ${profile.clan.name}`)
		console.log(`  Tag: ${profile.clan.tag}`)
		console.log(`  Status: ${profile.clan.status}`)
		console.log(`  Members: ${profile.clan.members.length}`)
		console.log(`  Leader: ${profile.clan.leader}`)
	}
}

async function createTestClan() {
	const existing = await prisma.userClanProfile.findUnique({
		where: { userId: USER_ID },
	})
	if (existing?.clanId) {
		console.log('User already has a clan. Remove it first with --remove.')
		return
	}

	await prisma.clanMember.deleteMany({ where: { userId: USER_ID } })
	if (existing) {
		await prisma.userClanProfile.delete({ where: { userId: USER_ID } })
	}

	const clanId = `test-clan-${Date.now()}`
	await prisma.clan.create({
		data: {
			id: clanId,
			name: 'Test Clan',
			tag: 'TEST',
			level: 5,
			level_points: 1000,
			alliance: 'stalkers',
			description: 'dev clan',
			leader: 'TestLeader',
			member_count: 5,
			region: 'RU',
			status: 'ACTIVE',
			members: {
				createMany: {
					data: [
						{ name: 'TestLeader', rank: 'LEADER', userId: USER_ID },
						{ name: 'TestOfficer', rank: 'OFFICER' },
						{ name: 'TestSoldier', rank: 'SOLDIER' },
						{ name: 'TestCommoner', rank: 'COMMONER' },
						{ name: 'TestRecruit', rank: 'RECRUIT' },
					],
				},
			},
			profile: {
				create: { userId: USER_ID, region: 'RU' },
			},
		},
	})

	console.log(`Test clan created: ${clanId} (ACTIVE, 5 members)`)
	await showStatus()
}

async function removeClan() {
	const profile = await prisma.userClanProfile.findUnique({
		where: { userId: USER_ID },
	})
	const orphan = await prisma.clanMember.findFirst({
		where: { userId: USER_ID },
	})
	const clanId = profile?.clanId ?? orphan?.clanId
	if (!clanId) {
		console.log('No clan to remove.')
		return
	}

	await prisma.stageAttendance.deleteMany({
		where: { session: { clanId } },
	})
	await prisma.stageScreenshot.deleteMany({
		where: { session: { clanId } },
	})
	await prisma.stageSession.deleteMany({ where: { clanId } })
	await prisma.grenadeSnapshot.deleteMany({ where: { clanId } })
	await prisma.clanMember.deleteMany({ where: { clanId } })
	await prisma.userClanProfile.deleteMany({ where: { clanId } })
	await prisma.clan.delete({ where: { id: clanId } }).catch(() => {})

	console.log(`Removed clan ${clanId} and all related data`)
}

async function createBulkClans(count: number) {
	const prefix = `bulk-${Date.now()}`
	let created = 0
	for (let i = 0; i < count; i++) {
		const clanId = `${prefix}-${i}`
		await prisma.clan.create({
			data: {
				id: clanId,
				name: `Bulk Clan ${i + 1}`,
				tag: `B${i}`,
				level: 5,
				level_points: 1000,
				alliance: 'stalkers',
				description: `Bulk test clan ${i + 1} without user`,
				leader: `Leader_${i}`,
				member_count: 0,
				region: 'RU',
				status: 'ACTIVE',
			},
		})
		created++
	}
	console.log(`Created ${created} clans without user (prefix: ${prefix})`)
}

async function removeBulkClans() {
	const { count } = await prisma.clan.deleteMany({
		where: { id: { startsWith: 'bulk-' } },
	})
	console.log(`Removed ${count} bulk clans`)
}

async function addPlayers() {
	const profile = await prisma.userClanProfile.findUnique({
		where: { userId: USER_ID },
	})
	if (!profile?.clanId) {
		console.log('User 1 has no clan. Create it first with --create-test.')
		return
	}
	const clanId = profile.clanId
	let added = 0
	let linked = 0
	for (const p of PLAYERS) {
		const rank = ROLE_TO_RANK[p.role] ?? 'SOLDIER'
		const exboAuth = await prisma.eXBOAuth.findFirst({
			where: { username: { equals: p.name, mode: 'insensitive' } },
		})
		await prisma.clanMember.upsert({
			where: { clanId_name: { clanId, name: p.name } },
			create: {
				clanId,
				name: p.name,
				rank,
				userId: exboAuth?.userid ?? null,
			},
			update: { rank, userId: exboAuth?.userid ?? null },
		})
		added++
		if (exboAuth) linked++
	}
	const count = await prisma.clanMember.count({ where: { clanId } })
	await prisma.clan.update({
		where: { id: clanId },
		data: { member_count: count },
	})
	console.log(
		`Added/updated ${added} players in clan ${clanId} (total members: ${count}, linked to user: ${linked})`
	)
	await showStatus()
}

async function main() {
	await init()
	const args = process.argv.slice(2)

	if (args.includes('--status') || args.length === 0) {
		await showStatus()
		return
	}

	const bulkArg = args.find((a) => a.startsWith('--create-bulk'))
	if (bulkArg) {
		const count = parseInt(bulkArg.split('=')[1] ?? '10', 10) || 10
		await createBulkClans(count)
	}
	if (args.includes('--create-test')) await createTestClan()
	if (args.includes('--add-players')) await addPlayers()
	if (args.includes('--remove')) await removeClan()
	if (args.includes('--remove-bulk')) await removeBulkClans()

	await prisma.$disconnect()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
