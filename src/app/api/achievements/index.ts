import { t } from 'elysia'

import {
	fromStore,
	fromStoreOpt,
	requireAuth,
	requireOptionalAuth,
} from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'
import { jwtPlugin } from '@/utils/jwt.plugin'
import { achievementService } from './achievement.service'

export const achievementRoutes = createElysia().group('/achievements', (app) =>
	app
		.use(jwtPlugin)
		.get(
			'',
			{
				beforeHandle: [requireOptionalAuth],
				detail: { tags: ['Achievements'] },
			},
			() => achievementService.listDefinitions()
		)
		.get(
			'/user/:user_id',
			{
				beforeHandle: [requireOptionalAuth],
				params: t.Object({ user_id: t.Numeric() }),
				detail: { tags: ['Achievements'] },
			},
			async ({ params, store }) => {
				const userId = Number(params.user_id)
				const achievements = await achievementService.getUserAchievements(userId)
				const requesterId = fromStoreOpt(store).user_id

				if (requesterId === userId) return achievements

				return achievements.filter(({ achievement }) => !achievement.hidden)
			}
		)
		.get(
			'/@me',
			{
				beforeHandle: [requireAuth],
				detail: { tags: ['Achievements'] },
			},
			({ store }) =>
				achievementService.getMyAchievements(fromStore(store).user_id)
			)
)
