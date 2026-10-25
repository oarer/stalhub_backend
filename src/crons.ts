import { cron } from '@elysia/cron'
import { sendAdminDigest } from '@/app/api/admin/dashboard/digest.service'
import { updateAllRegions as updateArtifacts } from '@/app/api/artifacts/aggregate'
import { refreshBalanceDiffs } from '@/app/api/balance/service'
import { clanService } from '@/app/api/clan/services/clan'
import { goldService } from '@/app/api/clan/services/gold'
import { grenadesService } from '@/app/api/clan/services/grenades'
import { personalService } from '@/app/api/personal/service'
import { serverOnlineService } from '@/app/api/server-online/server-online.service'
import { generateSystemTierLists } from '@/app/api/tier-lists/generator'
import { updateAllRegions as updateUpgradePrices } from '@/app/api/upgrade-prices/upgrade-prices.service'
import { withTracking } from '@/lib/cron-status'
import { prisma } from '@/lib/prisma'
import { createElysia } from '@/utils/elysia'

export const crons = createElysia()
	.use(
		cron({
			name: 'clanSync',
			pattern: '0 * * * *',
			run: withTracking('clanSync', '0 * * * *', undefined, async () => {
				const clans = await prisma.clan.findMany({
					where: { status: 'ACTIVE' },
				})
				for (const c of clans) {
					try {
						await clanService.sync(c.id, c.region)
					} catch {
						// sync failure for a single clan is non-fatal
					}
				}
			}),
		})
	)

	// tournament
	// STAGE_SCHEDULE TOURNAMENT: 20:00 / 20:25 / 20:50 / 21:15 MSK (+5min api cooldown)
	.use(
		cron({
			name: 'tournamentBeforeStages',
			pattern: '5 20 * * 4,5,6',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'tournamentBeforeStages',
				'5 20 * * 4,5,6',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'TOURNAMENT',
						'BEFORE_STAGES'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'tournamentBetween1and2',
			pattern: '30 20 * * 4,5,6',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'tournamentBetween1and2',
				'30 20 * * 4,5,6',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'TOURNAMENT',
						'BETWEEN_1_2'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'tournamentBetween2and3',
			pattern: '55 20 * * 4,5,6',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'tournamentBetween2and3',
				'55 20 * * 4,5,6',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'TOURNAMENT',
						'BETWEEN_2_3'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'tournamentAfterStages',
			pattern: '20 21 * * 4,5,6',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'tournamentAfterStages',
				'20 21 * * 4,5,6',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'TOURNAMENT',
						'AFTER_STAGES'
					)
				}
			),
		})
	)

	// brawl
	// STAGE_SCHEDULE BRAWL: 20:00 / 20:25 / 20:50 / 21:15 MSK (+5min api cooldown)
	.use(
		cron({
			name: 'brawlBeforeStages',
			pattern: '5 20 * * 0,1,2,3',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'brawlBeforeStages',
				'5 20 * * 0,1,2,3',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BRAWL',
						'BEFORE_STAGES'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'brawlBetween1and2',
			pattern: '30 20 * * 0,1,2,3',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'brawlBetween1and2',
				'30 20 * * 0,1,2,3',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BRAWL',
						'BETWEEN_1_2'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'brawlBetween2and3',
			pattern: '55 20 * * 0,1,2,3',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'brawlBetween2and3',
				'55 20 * * 0,1,2,3',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BRAWL',
						'BETWEEN_2_3'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'brawlAfterStages',
			pattern: '20 21 * * 0,1,2,3',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'brawlAfterStages',
				'20 21 * * 0,1,2,3',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BRAWL',
						'AFTER_STAGES'
					)
				}
			),
		})
	)

	// base capture
	// STAGE_SCHEDULE BASE_CAPTURE: 19:00 / 19:25 / 19:50 / 20:15 / 20:40 MSK (+5min api cooldown)
	.use(
		cron({
			name: 'baseCaptureBeforeStages',
			pattern: '5 19 * * 0',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'baseCaptureBeforeStages',
				'5 19 * * 0',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BASE_CAPTURE',
						'BEFORE_STAGES'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'baseCaptureBetween1and2',
			pattern: '30 19 * * 0',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'baseCaptureBetween1and2',
				'30 19 * * 0',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BASE_CAPTURE',
						'BETWEEN_1_2'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'baseCaptureBetween2and3',
			pattern: '55 19 * * 0',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'baseCaptureBetween2and3',
				'55 19 * * 0',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BASE_CAPTURE',
						'BETWEEN_2_3'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'baseCaptureBetween3and4',
			pattern: '20 20 * * 0',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'baseCaptureBetween3and4',
				'20 20 * * 0',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BASE_CAPTURE',
						'BETWEEN_3_4'
					)
				}
			),
		})
	)
	.use(
		cron({
			name: 'baseCaptureAfterStages',
			pattern: '45 20 * * 0',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'baseCaptureAfterStages',
				'45 20 * * 0',
				'Europe/Moscow',
				async () => {
					await grenadesService.takeSnapshotAll(
						'BASE_CAPTURE',
						'AFTER_STAGES'
					)
				}
			),
		})
	)

	// artifacts prices
	.use(
		cron({
			name: 'artifacts-update',
			pattern: '0 0,12 * * *',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'artifacts-update',
				'0 0,12 * * *',
				'Europe/Moscow',
				async () => {
					await updateArtifacts()
				}
			),
		})
	)

	// upgrade support/price items (tools, catalyst, battery)
	.use(
		cron({
			name: 'upgrade-prices-update',
			pattern: '30 1,13 * * *',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'upgrade-prices-update',
				'30 1,13 * * *',
				'Europe/Moscow',
				async () => {
					await updateUpgradePrices()
				}
			),
		})
	)

	// balance diffs (every 15 minutes)
	.use(
		cron({
			name: 'balance-diffs',
			pattern: '*/15 * * * *',
			run: withTracking(
				'balance-diffs',
				'*/15 * * * *',
				undefined,
				async () => {
					await refreshBalanceDiffs(true)
				}
			),
		})
	)

	// server online snapshots
	.use(
		cron({
			name: 'server-online-snapshot',
			pattern: '*/5 * * * *',
			run: withTracking(
				'server-online-snapshot',
				'*/5 * * * *',
				undefined,
				async () => {
					await serverOnlineService.snapshot()
				}
			),
		})
	)

	// gold drops
	.use(
		cron({
			name: 'goldDropSchedule',
			pattern: '5 21 * * *',
			run: withTracking(
				'goldDropSchedule',
				'5 21 * * *',
				undefined,
				async () => {
					await goldService.createSchedule(2)
				}
			),
		})
	)
	.use(
		cron({
			name: 'goldDropCleanup',
			pattern: '30 3 * * *',
			run: withTracking(
				'goldDropCleanup',
				'30 3 * * *',
				undefined,
				async () => {
					await goldService.cleanup()
				}
			),
		})
	)
	.use(
		cron({
			name: 'systemTierLists',
			pattern: '0 12 * * 3',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'systemTierLists',
				'0 12 * * 3',
				'Europe/Moscow',
				async () => {
					console.log('[Cron] Generating system tier lists...')
					await generateSystemTierLists()
					console.log('[Cron] System tier lists generated.')
				}
			),
		})
	)
	.use(
		cron({
			name: 'personalSnapshots',
			pattern: '7 */12 * * *',
			run: withTracking(
				'personalSnapshots',
				'7 */12 * * *',
				undefined,
				async () => {
					await personalService.snapshotAll()
				}
			),
		})
	)
	.use(
		cron({
			name: 'eforumSync',
			pattern: '*/2 * * * *',
			run: withTracking(
				'eforumSync',
				'*/2 * * * *',
				undefined,
				async () => {
					const { checkNewPosts } = await import(
						'@/app/api/eforum/service'
					)
					await checkNewPosts()
				}
			),
		})
	)
	.use(
		cron({
			name: 'adminDigest',
			pattern: '0 9 * * *',
			timezone: 'Europe/Moscow',
			run: withTracking(
				'adminDigest',
				'0 9 * * *',
				'Europe/Moscow',
				async () => {
					await sendAdminDigest()
				}
			),
		})
	)
	.setup(async () => {
		console.log('[TierLists] Generating system tier lists...')
		try {
			const count = await generateSystemTierLists()
			console.log(`TierLists] System tier lists generated: ${count}`)
		} catch (err) {
			console.error(
				'[TierLists] Failed to generate system tier lists:',
				err
			)
		}
		try {
			await refreshBalanceDiffs(true)
			console.log('[Balance] Initial balance diff refresh done.')
		} catch (err) {
			console.error(
				'[Balance] Failed to refresh balance diffs on start:',
				err
			)
		}
		try {
			await updateUpgradePrices()
			console.log('[UpgradePrices] Initial prices parsed on start.')
		} catch (err) {
			console.error(
				'[UpgradePrices] Failed to parse prices on start:',
				err
			)
		}
	})
