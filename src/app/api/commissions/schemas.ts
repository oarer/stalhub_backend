import { z } from 'zod'

const string = (max: number, min = 0) =>
	z
		.string()
		.trim()
		.min(min)
		.max(max)
		.refine((s) => !s.includes('\0'))
const id = string(100, 1)
const amount = z.number().int().positive().max(100_000_000)
export const profileSchema = z.object({
	version: z.number().int().min(0),
	description: string(4000),
	accepting: z.boolean(),
	currency: z.enum(['RUB', 'USD', 'EUR']),
	terms: string(10000),
	revisions: z.number().int().min(0).max(20),
	portfolio_ids: z.array(id).max(20),
	prices: z
		.array(
			z.object({
				id: id.optional(),
				title: string(160, 1),
				description: string(2000),
				amount,
				days_min: z.number().int().min(1).max(365),
				days_max: z.number().int().min(1).max(365),
			})
		)
		.max(20),
})
export const createSchema = z.object({
	key: id,
	artist_id: z.number().int().positive(),
	profile_version: z.number().int().positive(),
	price_ids: z.array(id).min(1).max(20),
	title: string(160, 1),
	brief: string(20000, 10),
	file_ids: z.array(id).max(10),
})
export const commandSchema = z.object({
	key: id,
	version: z.number().int().positive(),
	action: z.enum([
		'accept',
		'decline',
		'cancel',
		'cancel_confirm',
		'cancel_reject',
		'start',
		'deliver',
		'revise',
		'approve',
		'message',
		'payment_sent',
		'payment_received',
		'payment_reject',
		'dispute',
		'review',
		'review_report',
		'refund_sent',
		'refund_received',
		'refund_contest',
	]),
	content: string(10000).default(''),
	file_ids: z.array(id).max(10).default([]),
	target_id: id.optional(),
	due_at: string(50).optional(),
	score: z.number().int().min(1).max(5).optional(),
	payments: z
		.array(
			z.object({
				title: string(160, 1),
				amount,
				upfront: z.boolean(),
				instructions: string(4000, 1),
			})
		)
		.max(10)
		.optional(),
})
export const caseCommandSchema = z.object({
	key: id,
	version: z.number().int().positive(),
	action: z.enum(['claim', 'message', 'decide', 'reopen']),
	content: string(10000).default(''),
	obligations: string(10000).default(''),
	outcome: z
		.enum(['RESUME', 'COMPLETE', 'CANCEL', 'HIDE_REVIEW', 'KEEP_REVIEW'])
		.optional(),
	due_at: string(50).optional(),
	refund: z.number().int().min(0).max(100_000_000).default(0),
	file_ids: z.array(id).max(10).default([]),
})
export type ProfileInput = z.infer<typeof profileSchema>
export type CreateInput = z.infer<typeof createSchema>
export type CommandInput = z.infer<typeof commandSchema>
export type CaseCommandInput = z.infer<typeof caseCommandSchema>
