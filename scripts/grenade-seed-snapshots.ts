/**
 * Seed test grenade snapshots for a specific clan.
 *
 * Creates 4 checkpoints (BEFORE_STAGES, BETWEEN_1_2, BETWEEN_2_3, BETWEEN_3_4)
 * which produces 3 stages when displayed in the UI.
 *
 * Usage:
 *   bun run scripts/grenade-seed-snapshots.ts <clan_id> [eventType] [dateOffset]
 *
 * Examples:
 *   bun run scripts/grenade-seed-snapshots.ts clan_abc123
 *   bun run scripts/grenade-seed-snapshots.ts clan_abc123 BRAWL
 *   bun run scripts/grenade-seed-snapshots.ts clan_abc123 TOURNAMENT -1
 *
 * Arguments:
 *   clan_id      — ID клана (обязательно)
 *   eventType   — тип события: TOURNAMENT | BRAWL | BASE_CAPTURE (по умолчанию: TOURNAMENT)
 *   dateOffset  — смещение даты
 */

export {}

const [clan_id, eventTypeArg, dateOffsetArg] = process.argv.slice(2)

if (!clan_id) {
	console.error(
		'Usage: bun run scripts/grenade-seed-snapshots.ts <clan_id> [eventType] [dateOffset]'
	)
	console.error('  eventType: TOURNAMENT | BRAWL | BASE_CAPTURE (default: TOURNAMENT)')
	console.error('  dateOffset: days offset from today, e.g. -1 for yesterday (default: 0)')
	process.exit(1)
}

const VALID_EVENT_TYPES = ['TOURNAMENT', 'BRAWL', 'BASE_CAPTURE'] as const
type StageType = (typeof VALID_EVENT_TYPES)[number]

const eventType: StageType =
	VALID_EVENT_TYPES.includes(eventTypeArg as StageType)
		? (eventTypeArg as StageType)
		: 'TOURNAMENT'

const dateOffset =
	Number.isFinite(Number(dateOffsetArg)) ? Number(dateOffsetArg) : 0

const CHECKPOINTS = [
	'BEFORE_STAGES',
	'BETWEEN_1_2',
	'BETWEEN_2_3',
	'BETWEEN_3_4',
] as const

const BASE_MIN = 500
const BASE_MAX = 3000

const STAGE_MIN = 30
const STAGE_MAX = 250

function randInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min
}

function ts(): string {
	return new Date().toISOString().slice(11, 19)
}

const CHECKPOINT_OFFSETS_MIN = [0, 60, 120, 180]

process.env.DATABASE_URL = (process.env.DATABASE_URL ?? '').replace(
	/@postgres:/,
	'@localhost:'
)

async function main() {
	const { prisma } = await import('@/lib/prisma')

	const clan = await prisma.clan.findUnique({
		where: { id: clan_id },
		select: { id: true, region: true },
	})

	if (!clan) {
		console.error(`[${ts()}] Clan "${clan_id}" not found`)
		process.exit(1)
	}

	const members = await prisma.clanMember.findMany({
		where: { clan_id },
		select: { name: true },
	})

	if (members.length === 0) {
		console.error(`[${ts()}] Clan "${clan_id}" has no members`)
		process.exit(1)
	}

	console.log(
		`[${ts()}] Clan "${clan_id}" region=${clan.region} | members: ${members.length} | event: ${eventType} | dateOffset: ${dateOffset}`
	)

	// Build base totals for each member (their totals before the raid)
	const baseTotals = new Map<string, number>()
	for (const m of members) {
		baseTotals.set(m.name, randInt(BASE_MIN, BASE_MAX))
	}

	// Calculate cumulative totals for each checkpoint
	// Each stage adds some grenades on top of previous total
	const cumulativeTotals = new Map<string, number[]>()
	for (const m of members) {
		const base = baseTotals.get(m.name)!
		const totals: number[] = [base]
		for (let stage = 0; stage < 3; stage++) {
			const prev = totals[totals.length - 1]!
			totals.push(prev + randInt(STAGE_MIN, STAGE_MAX))
		}
		cumulativeTotals.set(m.name, totals)
	}

	// Base date for the raid (today + offset, at ~20:00 MSK)
	const raidBase = new Date()
	raidBase.setDate(raidBase.getDate() + dateOffset)
	// Set to 20:00 MSK = 17:00 UTC
	raidBase.setUTCHours(17, 0, 0, 0)

	console.log(
		`[${ts()}] Creating ${CHECKPOINTS.length} snapshots for raid date ${raidBase.toISOString().slice(0, 10)} (MSK)...`
	)

	for (let i = 0; i < CHECKPOINTS.length; i++) {
		const checkpoint = CHECKPOINTS[i]!
		const offsetMs = CHECKPOINT_OFFSETS_MIN[i]! * 60 * 1000
		const raidDate = new Date(raidBase.getTime() + offsetMs)

		const memberSnapshot = members.map((m) => ({
			name: m.name,
			total: cumulativeTotals.get(m.name)![i]!,
		}))

		await prisma.grenadeSnapshot.create({
			data: {
				clan_id,
				event_type: eventType,
				checkpoint,
				raid_date: raidDate,
				members: memberSnapshot as never,
			},
		})

		console.log(
			`[${ts()}] ✓ ${checkpoint} @ ${raidDate.toISOString()} — ${memberSnapshot.length} members | sample totals: ${memberSnapshot
				.slice(0, 3)
				.map((m) => `${m.name}=${m.total}`)
				.join(', ')}${memberSnapshot.length > 3 ? '...' : ''}`
		)
	}

	console.log(`\n[${ts()}] Done! Created 3-stage grenade event for clan "${clan_id}".`)
	console.log(
		`[${ts()}] Stage deltas (per member sample):`
	)

	for (const m of members.slice(0, 5)) {
		const totals = cumulativeTotals.get(m.name)!
		const stages = [
			totals[1]! - totals[0]!,
			totals[2]! - totals[1]!,
			totals[3]! - totals[2]!,
		]
		console.log(
			`         ${m.name}: base=${totals[0]} | stage1=+${stages[0]} | stage2=+${stages[1]} | stage3=+${stages[2]}`
		)
	}
	if (members.length > 5) {
		console.log(`         ... and ${members.length - 5} more members`)
	}

	await prisma.$disconnect()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
