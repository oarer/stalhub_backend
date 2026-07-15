import { t } from 'elysia'
import { prisma } from '@/lib/prisma'
import { fromStore, requireAuth } from '@/utils/auth.guard'
import { createElysia } from '@/utils/elysia'

const EXBO_API_BASE = 'https://exbo.net'

function decodeTokenBlob(tokenBlob: string) {
	return JSON.parse(Buffer.from(tokenBlob, 'base64').toString('utf-8')) as {
		access_token: string
		refresh_token?: string
	}
}

export const exboRoutes = createElysia().group('/exbo', (app) =>
	app.get(
		'/:region/characters',
		async ({ params, store, set }) => {
			const { userId } = fromStore(store)

			const auth = await prisma.eXBOAuth.findUnique({
				where: { userid: userId },
			})

			if (!auth) {
				set.status = 404
				return { error: 'EXBO account not linked' }
			}

			const { access_token } = decodeTokenBlob(auth.token_blob)

			const res = await fetch(
				`${EXBO_API_BASE}/${params.region}/characters`,
				{
					headers: {
						Authorization: `Bearer ${access_token}`,
					},
				}
			)

			const data = await res.text()

			if (!res.ok) {
				set.status = res.status
				return { error: data }
			}

			try {
				return JSON.parse(data)
			} catch {
				return data
			}
		},
		{
			beforeHandle: [requireAuth],
			params: t.Object({
				region: t.String({ error: 'region is required' }),
			}),
			detail: { tags: ['EXBO'] },
		}
	)
)
