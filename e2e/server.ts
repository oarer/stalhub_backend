import '../src/setup-typebox'
import { resolve } from 'node:path'
import cors from '@elysia/cors'
import { setFileTypeDetector } from 'elysia'
import { fileTypeFromBlob } from 'file-type'
import { routes } from '../src/app'
import { createElysia } from '../src/utils/elysia'

if (process.env.STALHUB_E2E !== '1')
	throw new Error('This launcher requires STALHUB_E2E=1')
const url = new URL(process.env.DATABASE_URL ?? '')
if (
	!['127.0.0.1', 'localhost'].includes(url.hostname) ||
	url.pathname !== '/stalhub_e2e'
)
	throw new Error('Disposable E2E database required')
setFileTypeDetector(async (file) => (await fileTypeFromBlob(file))?.mime)
createElysia()
	.use(
		cors({
			origin: process.env.WEB_ORIGIN ?? 'http://localhost:4310',
			credentials: true,
		})
	)
	.get('/uploads/*', ({ params, status }) => {
		const root = resolve('uploads')
		const requested = resolve(root, params['*'])
		if (!requested.startsWith(`${root}/`) || params['*'].includes('..'))
			return status(403, 'Forbidden')
		return Bun.file(requested)
	})
	.use(routes)
	.listen({ hostname: '127.0.0.1', port: Number(process.env.PORT ?? 4311) })
