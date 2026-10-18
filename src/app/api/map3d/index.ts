import { createElysia } from '@/utils/elysia'
import { handleMapAsset } from './bundle'
export const map3dRoutes = createElysia({ prefix: '/map3d' }).all(
	'/*',
	({ request, params }) => handleMapAsset(request, params['*']),
	{ parse: 'none' }
)
