import { requireAuth } from '@/utils/auth.guard'
import { clanContext } from '../context'
import { listingService } from '../services/listing'

export const listingRoutes = clanContext.group('/listing', (app) =>
	app
		.get(
			'/grenade-boxes',
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Clan'] },
			},
			async () => {
				const data = await listingService.getGrenadeBoxes()
				return Object.values(data).map((item) => ({
					id: item.id,
					name: listingService.extractName(item),
				}))
			}
		)
		.get(
			'/consumables',
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Clan'] },
			},
			async () => {
				const data = await listingService.getConsumables()
				return data.map((item) => ({
					id: item.id,
					name: listingService.extractName(item),
					category: item.category,
				}))
			}
		)
)
