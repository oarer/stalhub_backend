import { cron } from '@elysiajs/cron'
import { attachmentsRequestsTotal } from '@/app/api/metrics'
import { createElysia } from '@/utils/elysia'
import {
	getWeaponAttachments,
	loadAttachments,
	loadCompatibleIndex,
	loadWeapons,
	resetCache,
} from './utils'

export const routeAttachments = createElysia()
	.use(
		cron({
			name: 'attachments-update',
			pattern: '0 0 * * WED',
			timezone: 'Europe/Moscow',
			run: resetCache,
		})
	)
	.onStart(async () => {
		try {
			await loadAttachments()
			await loadWeapons()
			await loadCompatibleIndex()
		} catch (err) {
			console.error(
				'[Attachments] Failed to load data on start, will retry:',
				err
			)
			setTimeout(
				() =>
					loadAttachments()
						.then(loadWeapons)
						.then(loadCompatibleIndex)
						.catch(() => {}),
				60_000
			)
		}
	})
	.get('/attachments/:weaponId', async ({ params, status }) => {
		const { weaponId } = params

		await Promise.all([
			loadAttachments(),
			loadWeapons(),
			loadCompatibleIndex(),
		])

		const { weapon, attachments: result } = getWeaponAttachments(weaponId)

		if (!weapon) {
			return status(404, {
				status: 404,
				message: 'Weapon not found',
			})
		}

		attachmentsRequestsTotal.inc()

		return {
			weapon,
			total: result.length,
			attachments: result,
		}
	})
