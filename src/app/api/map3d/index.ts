import { createElysia } from '@/utils/elysia'
import { handleMapAsset } from './bundle'

// Fail-closed: без настроенного ключа весь /map3d закрыт,
// а не открыт всем желающим.
export const map3dRoutes = createElysia({ prefix: '/map3d' }).all(
	'/*',
	{ parse: 'none' },
	({ request, params, set }) => {
		// Читаем на каждом запросе — tests переопределяют значение после импорта.
		const accessKey = process.env.MAP3D_ACCESS_KEY
		if (
			!accessKey ||
			request.headers.get('x-stalhub-map-key') !== accessKey
		) {
			set.status = 404
			return { error: 'Not found' }
		}
		return handleMapAsset(request, params['*'])
	}
)
