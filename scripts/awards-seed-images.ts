/**
 * Attach placeholder images to award nominees and categories.
 *
 * The images are copied into the backend uploads directory and the resulting
 * `/uploads/...` URLs are written to the database. Published campaigns also
 * get their `results_snapshot` updated, because results are served from the
 * snapshot instead of the live tables.
 *
 * Usage:
 *   bun run scripts/awards-seed-images.ts [campaignId|year] [options]
 *
 * Options:
 *   --nominee-image <path>   nominee avatar source (default: ../stalhub/public/images/avatars/oarer.jpg)
 *   --category-image <path>  category image source (default: ../stalhub/public/images/photo_2026-11-21_15-58-03.jpg)
 *   --dry-run                validate sources and print the plan without writing
 *
 * Environment overrides:
 *   AWARDS_NOMINEE_IMAGE, AWARDS_CATEGORY_IMAGE
 *
 * Examples:
 *   bun run scripts/awards-seed-images.ts
 *   bun run scripts/awards-seed-images.ts 2030
 *   bun run scripts/awards-seed-images.ts 2030 --dry-run
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Prisma } from 'generated/prisma/client'

export {}

function normalizeDatabaseUrl(value: string) {
	let url = value.trim()
	if (
		(url.startsWith('"') && url.endsWith('"')) ||
		(url.startsWith("'") && url.endsWith("'"))
	) {
		url = url.slice(1, -1)
	}

	if (existsSync('/.dockerenv')) return url

	url = url.replace(/@postgres:/, '@localhost:')
	url = url.replace(
		/(postgres(?:ql)?:\/\/[^:@/]+:[^@/]+)(localhost:\d+)/,
		'$1@$2'
	)
	return url
}

process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL ?? '')

const DEFAULT_NOMINEE_IMAGE = resolve(
	process.cwd(),
	'../stalhub/public/images/avatars/oarer.jpg'
)
const DEFAULT_CATEGORY_IMAGE = resolve(
	process.cwd(),
	'../stalhub/public/images/photo_2026-11-21_15-58-03.jpg'
)
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

function fail(message: string): never {
	console.error(message)
	process.exit(1)
}

const positional: string[] = []
let nomineeImageSource =
	process.env.AWARDS_NOMINEE_IMAGE ?? DEFAULT_NOMINEE_IMAGE
let categoryImageSource =
	process.env.AWARDS_CATEGORY_IMAGE ?? DEFAULT_CATEGORY_IMAGE
let dryRun = false

for (let index = 0; index < process.argv.length - 2; index++) {
	const arg = process.argv[index + 2]!

	if (arg === '--dry-run') {
		dryRun = true
		continue
	}

	if (arg === '--nominee-image') {
		const value = process.argv[index + 3]
		if (!value) fail('Expected a path after --nominee-image')
		nomineeImageSource = value
		index++
		continue
	}

	if (arg.startsWith('--nominee-image=')) {
		nomineeImageSource = arg.slice('--nominee-image='.length)
		continue
	}

	if (arg === '--category-image') {
		const value = process.argv[index + 3]
		if (!value) fail('Expected a path after --category-image')
		categoryImageSource = value
		index++
		continue
	}

	if (arg.startsWith('--category-image=')) {
		categoryImageSource = arg.slice('--category-image='.length)
		continue
	}

	if (arg.startsWith('--')) {
		fail(`Unknown option "${arg}"`)
	}

	positional.push(arg)
}

const [target] = positional

const { prisma } = await import('@/lib/prisma')
const { deleteUpload, putUpload } = await import('@/lib/uploads')
const { compressImageBuffer } = await import('@/utils/image-compress')
const { validateImageUpload } = await import('@/utils/upload-validation')

type Campaign = {
	id: string
	year: number
	title: string
	status: string
	results_snapshot: Prisma.JsonValue | null
}

const campaignSelect = {
	id: true,
	year: true,
	title: true,
	status: true,
	results_snapshot: true,
} satisfies Prisma.AwardCampaignSelect

async function resolveCampaign(): Promise<Campaign> {
	if (target) {
		const byId = await prisma.awardCampaign.findUnique({
			where: { id: target },
			select: campaignSelect,
		})
		if (byId) return byId

		const year = Number(target)
		if (Number.isInteger(year)) {
			const byYear = await prisma.awardCampaign.findFirst({
				where: { year, is_test: false },
				select: campaignSelect,
			})
			if (byYear) return byYear
			fail(`Campaign for ${year} not found.`)
		}

		fail(`Campaign "${target}" not found. Pass a campaign id or year.`)
	}

	const latest = await prisma.awardCampaign.findFirst({
		where: { is_test: false },
		orderBy: { year: 'desc' },
		select: campaignSelect,
	})
	if (!latest) fail('No award campaigns found. Pass a campaign id or year.')
	return latest
}

async function readSourceImage(path: string, label: string) {
	const file = Bun.file(path)
	if (!(await file.exists())) fail(`${label} not found: ${path}`)

	const buffer = Buffer.from(await file.arrayBuffer())
	let validated: ReturnType<typeof validateImageUpload>
	try {
		validated = validateImageUpload(buffer)
	} catch (error) {
		fail(
			`${label} is not a valid image: ${error instanceof Error ? error.message : String(error)}`
		)
	}

	const data = await compressImageBuffer(buffer, validated.mime)
	return {
		data,
		ext: validated.ext,
		mime: validated.mime,
		source: path,
	}
}

async function storeImage(
	directory: string,
	baseName: string,
	image: Awaited<ReturnType<typeof readSourceImage>>
) {
	for (const ext of IMAGE_EXTENSIONS) {
		await deleteUpload(`${directory}/${baseName}${ext}`)
	}

	const publicPath = `${directory}/${baseName}${image.ext}`
	try {
		await putUpload(publicPath, image.data, image.mime)
	} catch (error) {
		fail(
			`Failed to store image ${publicPath}: ${error instanceof Error ? error.message : String(error)}`
		)
	}
	return publicPath
}

function updateSnapshot(
	snapshot: Prisma.JsonValue | null,
	nomineeUrl: string,
	categoryUrl: string
) {
	if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
		return null
	}

	const record = snapshot as Record<string, unknown>
	if (!Array.isArray(record.categories)) return null

	const categories = record.categories.map((value) => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return value
		}
		const category = value as Record<string, unknown>
		const nominees = Array.isArray(category.nominees)
			? category.nominees.map((nominee) => {
					if (
						!nominee ||
						typeof nominee !== 'object' ||
						Array.isArray(nominee)
					) {
						return nominee
					}
					return {
						...(nominee as Record<string, unknown>),
						avatar_url: nomineeUrl,
					}
				})
			: category.nominees
		return {
			...category,
			image_url: categoryUrl,
			nominees,
		}
	})

	return { ...record, categories }
}

const campaign = await resolveCampaign()

console.log(
	`Campaign: ${campaign.title} (${campaign.year}) [${campaign.id}] status=${campaign.status}`
)

const nomineeImage = await readSourceImage(nomineeImageSource, 'Nominee image')
const categoryImage = await readSourceImage(
	categoryImageSource,
	'Category image'
)

const nomineeBase = `seed-${campaign.year}-nominee`
const categoryBase = `seed-${campaign.year}-category`

if (dryRun) {
	console.log(
		`Nominee image: ${nomineeImage.source} -> ${nomineeBase}${nomineeImage.ext}`
	)
	console.log(
		`Category image: ${categoryImage.source} -> ${categoryBase}${categoryImage.ext}`
	)
	console.log('Dry run: no files or database rows were changed.')
	await prisma.$disconnect()
	process.exit(0)
}

const nomineeUrl = await storeImage(
	'/uploads/awards/nominees',
	nomineeBase,
	nomineeImage
)
const categoryUrl = await storeImage(
	'/uploads/awards/categories',
	categoryBase,
	categoryImage
)

const categories = await prisma.awardCategory.findMany({
	where: { campaign_id: campaign.id },
	select: { id: true },
})
const categoryIds = categories.map((category) => category.id)

const updatedCategories = await prisma.awardCategory.updateMany({
	where: { campaign_id: campaign.id },
	data: { image_url: categoryUrl },
})
const updatedNominees =
	categoryIds.length > 0
		? await prisma.awardNominee.updateMany({
				where: { category_id: { in: categoryIds } },
				data: { avatar_url: nomineeUrl },
			})
		: { count: 0 }

const snapshot = updateSnapshot(
	campaign.results_snapshot,
	nomineeUrl,
	categoryUrl
)
if (snapshot) {
	await prisma.awardCampaign.update({
		where: { id: campaign.id },
		data: { results_snapshot: snapshot as Prisma.InputJsonValue },
	})
}

console.log(`Nominee image: ${nomineeUrl} (${nomineeImage.source})`)
console.log(`Category image: ${categoryUrl} (${categoryImage.source})`)
console.log(
	`Updated nominees: ${updatedNominees.count}, categories: ${updatedCategories.count}`
)
console.log(
	snapshot
		? 'Results snapshot updated.'
		: 'No results snapshot found; only live tables were updated.'
)

await prisma.$disconnect()
