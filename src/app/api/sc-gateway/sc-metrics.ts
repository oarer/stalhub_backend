import { Counter, Gauge } from 'prom-client'
import { register as globalRegister } from '@/app/api/metrics'

export const scGatewayRequestsTotal = new Counter({
	name: 'sc_gateway_requests_total',
	help: 'Total requests routed through the SC gateway',
	labelNames: ['node', 'status'],
	registers: [globalRegister],
})

export const scGatewayTokensExhaustedTotal = new Counter({
	name: 'sc_gateway_tokens_exhausted_total',
	help: 'Total SC gateway requests rejected due to exhausted token quota',
	registers: [globalRegister],
})

export const scGatewayNodesExhaustedTotal = new Counter({
	name: 'sc_gateway_nodes_exhausted_total',
	help: 'Total SC gateway requests rejected due to exhausted node IP quota',
	registers: [globalRegister],
})

export const scGatewayNodesUp = new Gauge({
	name: 'sc_gateway_nodes_up',
	help: 'Number of enabled SC gateway nodes',
	registers: [globalRegister],
})

export const scGatewayTokensUp = new Gauge({
	name: 'sc_gateway_tokens_up',
	help: 'Number of enabled SC tokens in the pool',
	registers: [globalRegister],
})
