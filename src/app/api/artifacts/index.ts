import { Elysia, t } from 'elysia'
import type {
	ArtifactPriceQuery,
	ArtifactPriceResult,
	ArtifactPricesResponse,
} from '@/types/artifacts.type'
import { deferStartup } from '@/utils/startup'
import { SUPPORTED_REGIONS, updateAllRegions } from './aggregate'
import { getRegionCache } from './cache'
import { resolveArtifactPrice } from './pricing'

const priceRequestSchema = t.Array(
	t.Object({
		item_id: t.String(),
		qlt: t.Number({ minimum: 0, maximum: 6 }),
		ptn: t.Number({ minimum: 0, maximum: 15 }),
	})
)

export const artifactsRoutes = new Elysia()
	.onStart(() => {
		deferStartup(() => {
			const missing = SUPPORTED_REGIONS.filter(
				(region) => !getRegionCache(region)
			)
			if (missing.length > 0) {
				updateAllRegions().catch((err) =>
					console.error('[Artifacts] Failed to update on start:', err)
				)
			}
		})
	})
	.group('/artifacts-prices', (group) =>
		group.post(
			'/:region',
			{
				params: t.Object({ region: t.String() }),
				body: priceRequestSchema,
			},
			async ({ params, body, set }): Promise<ArtifactPricesResponse> => {
				const region = params.region

				if (
					!SUPPORTED_REGIONS.includes(
						region as (typeof SUPPORTED_REGIONS)[number]
					)
				) {
					set.status = 400
					return {
						updated_at: null,
						region,
						prices: [],
					}
				}

				const aggregate = await getRegionCache(region)

				if (!aggregate) {
					set.status = 503
					return {
						updated_at: null,
						region,
						prices: [],
					}
				}

				const prices: ArtifactPriceResult[] = body.map(
					(query: ArtifactPriceQuery) =>
						resolveArtifactPrice(
							aggregate,
							query.item_id,
							query.qlt,
							query.ptn
						)
				)

				return {
					updated_at: aggregate.updated_at,
					region,
					prices,
				}
			}
		)
	)
