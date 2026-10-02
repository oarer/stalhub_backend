import {
	exboApiDuration,
	exboApiRequestsTotal,
	recordAppError,
} from '@/app/api/metrics'
import { apiClient } from '@/app/interceptors/sc.interceptor'
import { env } from '@/env'
import { costOf, QUOTA_PER_MINUTE_TOKEN, SC_EAPI_BASE_URL } from './config'
import { listNodes, markNodeError, markNodeSeen, pickNode } from './nodes'
import { pickToken } from './pool'
import { release, releaseNode, tryReserveNode } from './quota'
import {
	scGatewayNodesExhaustedTotal,
	scGatewayRequestsTotal,
	scGatewayTokensExhaustedTotal,
} from './sc-metrics'

export interface GatewayOptions {
	method?: string
	params?: Record<string, unknown>
	data?: unknown
	headers?: Record<string, string>
}

export interface NormalizedGatewayError {
	status: number
	message: string
	details?: unknown
}

interface NodeExecuteResponse {
	status: number
	data: unknown
}

async function executeDirect<T>(
	token: string,
	path: string,
	options: GatewayOptions
): Promise<T> {
	const started = Date.now()
	try {
		const { data } = await apiClient.request<T>({
			method: options.method ?? 'GET',
			url: path,
			params: options.params,
			data: options.data,
			headers: {
				Authorization: `Bearer ${token}`,
				...options.headers,
			},
			_skipAuth: true,
		} as never)
		exboApiRequestsTotal.inc({ status: '200' })
		scGatewayRequestsTotal.inc({ node: 'direct', status: '200' })
		return data
	} catch (error) {

		const status =
			error && typeof error === 'object' && 'status' in error
				? String((error as { status: unknown }).status)
				: '500'
		exboApiRequestsTotal.inc({ status })
		scGatewayRequestsTotal.inc({ node: 'direct', status })
		recordAppError('exbo_api')
		throw error
	} finally {
		exboApiDuration.observe((Date.now() - started) / 1000)
	}
}
async function executeViaNode(
	baseUrl: string,
	nodeApiKey: string,
	token: string,
	path: string,
	options: GatewayOptions,
	timeoutMs: number
): Promise<NodeExecuteResponse> {
	const started = Date.now()
	try {
		const res = await fetch(`${baseUrl}/sc/execute`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(nodeApiKey
					? { Authorization: `Bearer ${nodeApiKey}` }
					: {}),
			},
			body: JSON.stringify({
				method: options.method ?? 'GET',
				path,
				params: options.params ?? {},
				data: options.data ?? null,
				token,
			}),
			signal: AbortSignal.timeout(timeoutMs),
		})
		if (!res.ok) {
			throw new Error(`Node transport HTTP ${res.status}`)
		}
		return (await res.json()) as NodeExecuteResponse
	} finally {
		exboApiDuration.observe((Date.now() - started) / 1000)
	}
}

export async function gatewayRequest<T>(
	path: string,
	options: GatewayOptions = {}
): Promise<T> {
	const cost = costOf(path)
	const triedTokenIds = new Set<number>()
	const triedNodeIds = new Set<number>()
	const nodeCount = (await listNodes()).length

	for (let attempt = 0; attempt <= nodeCount; attempt++) {
		const token = await pickToken(cost, triedTokenIds)
		if (!token) {
			scGatewayTokensExhaustedTotal.inc()
			throw {
				status: 429,
				message: `All SC tokens exhausted (${QUOTA_PER_MINUTE_TOKEN} uses/min each)`,
			} satisfies NormalizedGatewayError
		}

		const node = await pickNode(cost, triedNodeIds)
		if (!node) {

			if (!env.SC_GATEWAY_DIRECT_FALLBACK) {
				await release(token.id, cost)
				throw {
					status: 503,
					message: 'No SC nodes available',
				} satisfies NormalizedGatewayError
			}
			const direct = await tryReserveNode('direct', cost)
			if (!direct.ok) {
				await release(token.id, cost)
				scGatewayNodesExhaustedTotal.inc()
				throw {
					status: 429,
					message: 'All SC nodes IP-exhausted (800 uses/min each)',
				} satisfies NormalizedGatewayError
			}
			return executeDirect<T>(token.value, path, options)
		}

		try {
			const res = await executeViaNode(
				node.base_url,
				node.api_key,
				token.value,
				path,
				options,
				node.timeout_ms
			)
			if (res.status >= 200 && res.status < 300) {
				await markNodeSeen(node.id)
				exboApiRequestsTotal.inc({ status: String(res.status) })
				scGatewayRequestsTotal.inc({
					node: node.name,
					status: String(res.status),
				})
				return res.data as T
			}
			// eAPI-level error through the node: do not retry other nodes
			// for client errors, except 429 (quota desync -> next token).
			await markNodeSeen(node.id)
			exboApiRequestsTotal.inc({ status: String(res.status) })
			scGatewayRequestsTotal.inc({
				node: node.name,
				status: String(res.status),
			})
			if (res.status === 429) {
				triedTokenIds.add(token.id)
				continue
			}
			const body = res.data as { title?: string; details?: unknown }
			throw {
				status: res.status,
				message: body?.title ?? `eAPI returned ${res.status}`,
				details: body?.details ?? res.data,
			} satisfies NormalizedGatewayError
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error)
				throw error
			// Network/node failure: request never reached eAPI,
			// release both reservations, exclude node, retry.
			await release(token.id, cost)
			await releaseNode(node.id, cost)
			triedNodeIds.add(node.id)
			await markNodeError(
				node.id,
				error instanceof Error ? error.message : 'Node request failed'
			)
			recordAppError('sc_gateway_node')
			scGatewayRequestsTotal.inc({
				node: node.name,
				status: 'node_error',
			})
			continue
		}
	}

	throw {
		status: 503,
		message: 'All SC nodes failed',
	} satisfies NormalizedGatewayError
}

export const scGateway = {
	get: <T>(path: string, params?: Record<string, unknown>) =>
		gatewayRequest<T>(path, { method: 'GET', params }),
	request: gatewayRequest,
	eapiBaseUrl: SC_EAPI_BASE_URL,
}
