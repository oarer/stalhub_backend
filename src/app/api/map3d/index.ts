import { env } from '@/env'
import { createElysia } from '@/utils/elysia'
import { handleMapAsset } from './bundle'
export const map3dRoutes = createElysia({ prefix: '/map3d' }).all(
	'/*',
	{ parse: 'none' },
	({ request, params, set }) => {
		const accessKey = env.MAP3D_ACCESS_KEY
		if (
			accessKey &&
			request.headers.get('x-stalhub-map-key') !== accessKey
		) {
			set.status = 404
			return { error: 'Not found' }
		}
		return handleMapAsset(request, params['*'])
	}
)
