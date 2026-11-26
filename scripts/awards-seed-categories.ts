/**
 * Create award categories (nominations), nominees and random votes.
 *
 * Usage:
 *   bun run scripts/awards-seed-categories.ts <campaignId|year> [count] [options]
 *
 * Options:
 *   --nominees <n>   nominees per category (default: 10)
 *   --votes <n>      random votes per category (default: 50)
 *   --reset          delete existing votes for seeded categories first
 *
 * Examples:
 *   bun run scripts/awards-seed-categories.ts 2026
 *   bun run scripts/awards-seed-categories.ts cmxxxxxxxxxxxx 14 --votes 100
 *   bun run scripts/awards-seed-categories.ts 2026 --reset
 *
 * The script is idempotent: categories are upserted by campaign + slug.
 * Positions are assigned 1..N, so the first three categories have the highest
 * priority (positions 1, 2 and 3).
 *
 * Seed votes are only assigned to dedicated test users with the
 * `awards_seed_<campaignId>_` prefix, so real users never receive fake votes.
 * The script creates as many reusable test users as needed.
 */

export {}

function normalizeDatabaseUrl(value: string) {
	let url = value.trim()
	if (
		(url.startsWith('"') && url.endsWith('"')) ||
		(url.startsWith("'") && url.endsWith("'"))
	) {
		url = url.slice(1, -1)
	}

	url = url.replace(/@postgres:/, '@localhost:')
	url = url.replace(
		/(postgres(?:ql)?:\/\/[^:@/]+:[^@/]+)(localhost:\d+)/,
		'$1@$2'
	)
	return url
}

process.env.DATABASE_URL = normalizeDatabaseUrl(
	process.env.DATABASE_URL ?? ''
)

const DEFAULT_COUNT = 14
const DEFAULT_NOMINEES = 10
const DEFAULT_VOTES = 50
const PRIORITY_COUNT = 3

function fail(message: string): never {
	console.error(message)
	process.exit(1)
}

function parsePositiveInt(value: string | undefined, fallback: number) {
	if (value === undefined) return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < 0) {
		fail(`Expected a non-negative integer, got "${value}"`)
	}
	return parsed
}

const positional: string[] = []
let nomineesPerCategory = DEFAULT_NOMINEES
let votesPerCategory = DEFAULT_VOTES
let resetVotes = false

for (let index = 0; index < process.argv.length - 2; index++) {
	const arg = process.argv[index + 2]!

	if (arg === '--reset') {
		resetVotes = true
		continue
	}

	if (arg === '--nominees') {
		nomineesPerCategory = parsePositiveInt(
			process.argv[index + 3],
			DEFAULT_NOMINEES
		)
		index++
		continue
	}

	if (arg.startsWith('--nominees=')) {
		nomineesPerCategory = parsePositiveInt(
			arg.slice('--nominees='.length),
			DEFAULT_NOMINEES
		)
		continue
	}

	if (arg === '--votes') {
		votesPerCategory = parsePositiveInt(
			process.argv[index + 3],
			DEFAULT_VOTES
		)
		index++
		continue
	}

	if (arg.startsWith('--votes=')) {
		votesPerCategory = parsePositiveInt(
			arg.slice('--votes='.length),
			DEFAULT_VOTES
		)
		continue
	}

	if (arg.startsWith('--')) {
		fail(`Unknown option "${arg}"`)
	}

	positional.push(arg)
}

const [target, countArg] = positional
const count = parsePositiveInt(countArg, DEFAULT_COUNT)

function shuffle<T>(items: T[]): T[] {
	const result = [...items]
	for (let index = result.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(Math.random() * (index + 1))
		;[result[index], result[swapIndex]] = [
			result[swapIndex]!,
			result[index]!,
		]
	}
	return result
}

function weightedPick<T>(items: T[], weights: number[]): T {
	const total = weights.reduce((sum, weight) => sum + weight, 0)
	let cursor = Math.random() * total
	for (let index = 0; index < items.length; index++) {
		cursor -= weights[index]!
		if (cursor <= 0) return items[index]!
	}
	return items[items.length - 1]!
}

const { prisma } = await import('@/lib/prisma')

async function resolveCampaign() {
	if (target) {
		const byId = await prisma.awardCampaign.findUnique({
			where: { id: target },
			select: { id: true, year: true, title: true },
		})
		if (byId) return byId

		const year = Number(target)
		if (Number.isInteger(year)) {
			const byYear = await prisma.awardCampaign.findUnique({
				where: { year },
				select: { id: true, year: true, title: true },
			})
			if (byYear) return byYear

			console.log(
				`Campaign for ${year} not found, creating a new one...`
			)
			return prisma.awardCampaign.create({
				data: {
					title: `StalZone Awards ${year}`,
					year,
				},
				select: { id: true, year: true, title: true },
			})
		}

		fail(`Campaign "${target}" not found. Pass a campaign id or year.`)
	}

	const latest = await prisma.awardCampaign.findFirst({
		orderBy: { year: 'desc' },
		select: { id: true, year: true, title: true },
	})
	if (!latest) {
		fail('No award campaigns found. Pass a year to create one.')
	}
	return latest
}

async function ensureVoters(required: number) {
	if (required === 0) return []

	const prefix = `awards_seed_${campaign.id}_`
	const existing = await prisma.user.findMany({
		where: { username: { startsWith: prefix } },
		select: { id: true, username: true },
		orderBy: { id: 'asc' },
	})
	const used = new Set(existing.map((user) => user.username))

	const data: { username: string; name: string; onboarded: boolean }[] = []
	let suffix = 1
	while (existing.length + data.length < required) {
		let username = `${prefix}${suffix++}`
		while (used.has(username)) username = `${prefix}${suffix++}`
		used.add(username)
		data.push({
			username,
			name: `Awards Seed ${suffix - 1}`,
			onboarded: true,
		})
	}

	if (data.length > 0) {
		await prisma.user.createMany({ data, skipDuplicates: true })
		console.log(`Created ${data.length} test voters`)
	}

	return prisma.user.findMany({
		where: { username: { startsWith: prefix } },
		select: { id: true },
		orderBy: { id: 'asc' },
	})
}

async function ensureNominees(categoryId: string, desired: number) {
	const existing = await prisma.awardNominee.findMany({
		where: { category_id: categoryId },
		select: { id: true, name: true, position: true },
		orderBy: { position: 'asc' },
	})
	if (existing.length > 0) return existing

	if (desired > 0) {
		await prisma.awardNominee.createMany({
			data: Array.from({ length: desired }, (_, index) => ({
				category_id: categoryId,
				name: `Номинант ${index + 1}`,
				position: index + 1,
			})),
		})
	}

	return prisma.awardNominee.findMany({
		where: { category_id: categoryId },
		select: { id: true, name: true, position: true },
		orderBy: { position: 'asc' },
	})
}

const campaign = await resolveCampaign()

console.log(
	`Campaign: ${campaign.title} (${campaign.year}) [${campaign.id}]`
)
console.log(
	`Creating ${count} categories, up to ${nomineesPerCategory} nominees and ${votesPerCategory} votes each...`
)

const voters = await ensureVoters(votesPerCategory)
const categoryIds: string[] = []

try {
	for (let index = 0; index < count; index++) {
		const position = index + 1
		const padded = String(position).padStart(2, '0')
		const slug = `nomination-${padded}`
		const title = `Номинация ${position}`
		const titleI18n = {
			en: `Nomination ${position}`,
			ru: title,
		}

		const category = await prisma.awardCategory.upsert({
			where: {
				campaign_id_slug: {
					campaign_id: campaign.id,
					slug,
				},
			},
			create: {
				campaign_id: campaign.id,
				description_i18n: null,
				kind: 'NOMINEES',
				position,
				slug,
				title_i18n: titleI18n,
			},
			update: {
				description_i18n: null,
				kind: 'NOMINEES',
				position,
				title_i18n: titleI18n,
			},
			select: {
				id: true,
				position: true,
				slug: true,
			},
		})
		categoryIds.push(category.id)

		const nominees = await ensureNominees(
			category.id,
			nomineesPerCategory
		)

		if (resetVotes) {
			await prisma.awardVote.deleteMany({
				where: { category_id: category.id },
			})
		}

		if (nominees.length > 0 && votesPerCategory > 0) {
			const weights = nominees.map(() => 1 + Math.random() * 9)
			const selectedVoters = shuffle(voters).slice(
				0,
				votesPerCategory
			)
			await prisma.awardVote.createMany({
				data: selectedVoters.map((voter) => ({
					category_id: category.id,
					nominee_id: weightedPick(nominees, weights).id,
					user_id: voter.id,
				})),
				skipDuplicates: true,
			})
		}

		const totalVotes = await prisma.awardVote.count({
			where: { category_id: category.id },
		})
		const marker =
			position <= PRIORITY_COUNT ? '  ← highest priority' : ''
		console.log(
			`  ${position}. ${category.slug} (${category.id}) — nominees: ${nominees.length}, votes: ${totalVotes}${marker}`
		)
	}
} finally {
	await prisma.$disconnect()
}

console.log('Done.')
