import { cron } from '@elysiajs/cron'
import { createElysia } from '@/utils/elysia'
import { attachPrices, loadHideoutData, updatePrices } from './hideout.service'

export const routeHideout = createElysia()
	.use(
		cron({
			name: 'hideout-update',
			pattern: '0 0,12 * * *',
			timezone: 'Europe/Moscow',
			run: updatePrices,
		})
	)
	.onStart(async () => {
		try {
			await loadHideoutData()
		} catch (err) {
			console.error('[Hideout] Failed to load data on start, will retry:', err)
			setTimeout(() => loadHideoutData().catch(() => {}), 60_000)
		}
		updatePrices().catch((err) =>
			console.error('[Hideout] Initial price update failed:', err)
		)
	})
	.get('/hideout', async () => {
		const data = await loadHideoutData()
		return attachPrices(data)
	})
