import { Elysia, t } from 'elysia'
import type {
	ArtifactPriceQuery,
	ArtifactPriceResult,
	ArtifactPricesResponse,
} from '@/types/artifacts.type'
import { SUPPORTED_REGIONS, updateRegion } from './aggregate'
import { getRegionCache } from './cache'
import { resolveArtifactPrice } from './pricing'

const priceRequestSchema = t.Array(
	t.Object({
		itemId: t.String(),
		qlt: t.Number({ minimum: 0, maximum: 6 }),
		ptn: t.Number({ minimum: 0, maximum: 15 }),
	})
)

export const artifactsRoutes = new Elysia()
	.onStart(async () => {
		for (const region of SUPPORTED_REGIONS) {
			const cached = await getRegionCache(region)
			if (!cached) {
				await updateRegion(region)
			}
		}
	})
	.group('/artifacts-prices', (group) =>
		group.post(
			'/:region',
			async ({ params, body, set }): Promise<ArtifactPricesResponse> => {
				const region = params.region

				if (
					!SUPPORTED_REGIONS.includes(
						region as (typeof SUPPORTED_REGIONS)[number]
					)
				) {
					set.status = 400
					return {
						updatedAt: null,
						region,
						prices: [],
					}
				}

				const aggregate = await getRegionCache(region)

				if (!aggregate) {
					set.status = 503
					return {
						updatedAt: null,
						region,
						prices: [],
					}
				}

				const prices: ArtifactPriceResult[] = body.map(
					(query: ArtifactPriceQuery) =>
						resolveArtifactPrice(
							aggregate,
							query.itemId,
							query.qlt,
							query.ptn
						)
				)

				return {
					updatedAt: aggregate.updatedAt,
					region,
					prices,
				}
			},
			{
				params: t.Object({ region: t.String() }),
				body: priceRequestSchema,
			}
		)
	)
