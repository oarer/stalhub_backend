import { HttpsProxyAgent } from 'https-proxy-agent'
import { WebSocket as WsWebSocket } from 'ws'
import { log } from './logger'

const proxyUrl =
	process.env.HTTPS_PROXY ??
	process.env.HTTP_PROXY ??
	process.env.ALL_PROXY ??
	''

if (proxyUrl) {
	const agent = new HttpsProxyAgent(proxyUrl)

	class ProxyWebSocket extends WsWebSocket {
		constructor(
			address: string | URL,
			protocols?: string | string[],
			options?: ConstructorParameters<typeof WsWebSocket>[2]
		) {
			super(address as string, protocols, { ...options, agent })
			const self = this as unknown as WsWebSocket
			self.on('open', () =>
				log(`Gateway WS open: ${String(address).slice(0, 60)}`)
			)
			self.on('error', (e) => log(`Gateway WS error: ${e.message}`))
		}
	}

	Object.defineProperty(globalThis, 'WebSocket', {
		value: ProxyWebSocket,
		configurable: true,
		writable: true,
	})
	log('Patched globalThis.WebSocket to route through HTTP proxy')
}
