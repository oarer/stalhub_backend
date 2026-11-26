import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

const enabled = process.env.STALHUB_AWARDS_TEST === '1'

if (!enabled) {
	test.skip('Awards integration tests require STALHUB_AWARDS_TEST=1')
} else {
	const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
	if (
		!['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
		!databaseUrl.pathname.endsWith('_awards_test')
	) {
		test.skip('Awards tests require a disposable *_awards_test database')
	} else {
		describe('Awards integration contract', () => {
			let db: typeof import('../src/lib/prisma').prisma
			let service: typeof import('../src/app/api/admin/awards/awards.service')
			let results: typeof import('../src/app/api/admin/awards/results')
			let userId = 0
			let prefix = ''
			let campaignId = ''
			let categoryId = ''

			beforeAll(async () => {
				db = (await import('../src/lib/prisma')).prisma
				service = await import(
					'../src/app/api/admin/awards/awards.service'
				)
				results = await import('../src/app/api/admin/awards/results')
				prefix = `awards_${Date.now()}`
				const user = await db.user.create({
					data: { username: `${prefix}_admin` },
				})
				userId = user.id
			})

			afterAll(async () => {
				if (!db) return
				if (campaignId)
					await db.awardCampaign
						.delete({ where: { id: campaignId } })
						.catch(() => undefined)
				if (userId)
					await db.user
						.delete({ where: { id: userId } })
						.catch(() => undefined)
			})

			test('campaign and category creation validates locale data and slug uniqueness', async () => {
				const campaign = await service.createCampaign({
					year: 3000 + Math.floor(Math.random() * 500),
					title: `${prefix} Awards`,
				})
				campaignId = campaign.id
				const categoryImage =
					'/uploads/awards/categories/test-category.jpg'
				const titles = {
					ru: 'Лучшая номинация',
					en: 'Best nomination',
					es: 'Mejor',
					fr: 'Meilleur',
					ko: '최고',
				}
				const category = await service.createCategory(
					campaignId,
					{ title_i18n: titles, image_url: categoryImage },
					userId
				)
				categoryId = category.id
				expect(category.slug).toBeTruthy()
				await expect(
					service.createCategory(
						campaignId,
						{ title_i18n: { en: 'Only English' } },
						userId
					)
				).rejects.toMatchObject({ code: 'missing_locales' })
				await expect(
					service.createCategory(
						campaignId,
						{ title_i18n: titles },
						userId
					)
				).rejects.toMatchObject({ code: 'image_required' })
				const updates = await service.createCategory(
					campaignId,
					{
						title_i18n: { ...titles, ru: 'Обновления' },
						kind: 'UPDATES',
						image_url: categoryImage,
					},
					userId
				)
				const clans = await service.createCategory(
					campaignId,
					{
						title_i18n: { ...titles, ru: 'Кланы' },
						kind: 'CLAN',
						image_url: categoryImage,
					},
					userId
				)
				expect(updates.kind).toBe('UPDATES')
				expect(clans.kind).toBe('CLAN')
			})

			test('category patch persists kind changes', async () => {
				const clan = await service.patchCategory(
					campaignId,
					categoryId,
					{ kind: 'CLAN' },
					userId
				)
				expect(clan.kind).toBe('CLAN')
				const nominees = await service.patchCategory(
					campaignId,
					categoryId,
					{ kind: 'NOMINEES' },
					userId
				)
				expect(nominees.kind).toBe('NOMINEES')
			})

			test('pure ranking and tie rules are available to integration consumers', () => {
				const ranked = results.computePlaces([
					{
						id: 'a',
						votes_count: 5,
						manual_place: null,
						place: null,
					},
					{
						id: 'b',
						votes_count: 3,
						manual_place: null,
						place: null,
					},
					{
						id: 'c',
						votes_count: 3,
						manual_place: null,
						place: null,
					},
				])
				expect(ranked.map((row) => row.place)).toEqual([1, 2, 2])
			})

			test('campaign results remain unpublished until publication', async () => {
				await expect(
					service.results(campaignId)
				).resolves.toMatchObject({
					campaign_id: campaignId,
					can_publish: false,
				})
			})

			test('nominee creation rejects CLAN categories', async () => {
				const clan = await db.awardCategory.findFirst({
					where: { campaign_id: campaignId, kind: 'CLAN' },
					select: { id: true },
				})
				if (!clan) throw new Error('CLAN fixture missing')
				await expect(
					service.createNominee(
						campaignId,
						clan.id,
						{ name: 'Manual clan' },
						userId
					)
				).rejects.toMatchObject({ code: 'clan_nominees_readonly' })
			})

			test('nominee deletion cascades votes at the database boundary', async () => {
				const nominee = await db.awardNominee.create({
					data: {
						category_id: categoryId,
						name: 'Cascade nominee',
						description_i18n: {
							ru: 'x',
							en: 'x',
							es: 'x',
							fr: 'x',
							ko: 'x',
						},
					},
					select: { id: true },
				})
				await db.awardVote.create({
					data: {
						category_id: categoryId,
						nominee_id: nominee.id,
						user_id: userId,
					},
					select: { id: true },
				})
				await db.awardNominee.delete({ where: { id: nominee.id } })
				expect(
					await db.awardVote.count({
						where: { nominee_id: nominee.id },
					})
				).toBe(0)
			})
		})
	}
}
