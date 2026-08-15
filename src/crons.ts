import { cron } from '@elysiajs/cron'
import { updateAllRegions as updateArtifacts } from '@/app/api/artifacts/aggregate'
import { clanService } from '@/app/api/clan/services/clan'
import { goldService } from '@/app/api/clan/services/gold'
import { grenadesService } from '@/app/api/clan/services/grenades'
import { prisma } from '@/lib/prisma'
import { createElysia } from '@/utils/elysia'

export const crons = createElysia()
	.use(
		cron({
			name: 'clanSync',
			pattern: '0 * * * *',
			async run() {
				const clans = await prisma.clan.findMany({
					where: { status: 'ACTIVE' },
				})
				for (const c of clans) {
					try {
						await clanService.sync(c.id, c.region)
					} catch {}
				}
			},
		})
	)

	// tournament
	.use(
		cron({
			name: 'tournamentBeforeStages',
			pattern: '0 17 * * 4,5,6',
			async run() {
				await grenadesService.takeSnapshotAll(
					'TOURNAMENT',
					'BEFORE_STAGES'
				)
			},
		})
	)
	.use(
		cron({
			name: 'tournamentBetween1and2',
			pattern: '25 17 * * 4,5,6',
			async run() {
				await grenadesService.takeSnapshotAll(
					'TOURNAMENT',
					'BETWEEN_1_2'
				)
			},
		})
	)
	.use(
		cron({
			name: 'tournamentBetween2and3',
			pattern: '50 17 * * 4,5,6',
			async run() {
				await grenadesService.takeSnapshotAll(
					'TOURNAMENT',
					'BETWEEN_2_3'
				)
			},
		})
	)
	.use(
		cron({
			name: 'tournamentAfterStages',
			pattern: '15 18 * * 4,5,6',
			async run() {
				await grenadesService.takeSnapshotAll(
					'TOURNAMENT',
					'AFTER_STAGES'
				)
			},
		})
	)

	// brawl
	.use(
		cron({
			name: 'brawlBeforeStages',
			pattern: '0 17 * * 0,1,2,6',
			async run() {
				await grenadesService.takeSnapshotAll('BRAWL', 'BEFORE_STAGES')
			},
		})
	)
	.use(
		cron({
			name: 'brawlBetween1and2',
			pattern: '25 17 * * 0,1,2,6',
			async run() {
				await grenadesService.takeSnapshotAll('BRAWL', 'BETWEEN_1_2')
			},
		})
	)
	.use(
		cron({
			name: 'brawlBetween2and3',
			pattern: '50 17 * * 0,1,2,6',
			async run() {
				await grenadesService.takeSnapshotAll('BRAWL', 'BETWEEN_2_3')
			},
		})
	)
	.use(
		cron({
			name: 'brawlAfterStages',
			pattern: '15 18 * * 0,1,2,6',
			async run() {
				await grenadesService.takeSnapshotAll('BRAWL', 'AFTER_STAGES')
			},
		})
	)

	// base capture
	.use(
		cron({
			name: 'baseCaptureBeforeStages',
			pattern: '0 16 * * 0',
			async run() {
				await grenadesService.takeSnapshotAll(
					'BASE_CAPTURE',
					'BEFORE_STAGES'
				)
			},
		})
	)
	.use(
		cron({
			name: 'baseCaptureBetween1and2',
			pattern: '25 16 * * 0',
			async run() {
				await grenadesService.takeSnapshotAll(
					'BASE_CAPTURE',
					'BETWEEN_1_2'
				)
			},
		})
	)
	.use(
		cron({
			name: 'baseCaptureBetween2and3',
			pattern: '50 16 * * 0',
			async run() {
				await grenadesService.takeSnapshotAll(
					'BASE_CAPTURE',
					'BETWEEN_2_3'
				)
			},
		})
	)
	.use(
		cron({
			name: 'baseCaptureBetween3and4',
			pattern: '15 17 * * 0',
			async run() {
				await grenadesService.takeSnapshotAll(
					'BASE_CAPTURE',
					'BETWEEN_3_4'
				)
			},
		})
	)
	.use(
		cron({
			name: 'baseCaptureAfterStages',
			pattern: '40 17 * * 0',
			async run() {
				await grenadesService.takeSnapshotAll(
					'BASE_CAPTURE',
					'AFTER_STAGES'
				)
			},
		})
	)

	// artifacts prices
	.use(
		cron({
			name: 'artifacts-update',
			pattern: '0 0,12 * * *',
			timezone: 'Europe/Moscow',
			async run() {
				await updateArtifacts()
			},
		})
	)

	// gold drops
	.use(
		cron({
			name: 'goldDropSchedule',
			pattern: '5 21 * * *',
			async run() {
				await goldService.createSchedule(2)
			},
		})
	)
	.use(
		cron({
			name: 'goldDropCleanup',
			pattern: '30 3 * * *',
			async run() {
				await goldService.cleanup()
			},
		})
	)
