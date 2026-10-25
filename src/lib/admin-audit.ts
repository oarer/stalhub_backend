import type { Prisma } from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'

export interface AdminAuditInput {
	actor_id?: number | null
	actor_name?: string | null
	action: string
	entity: string
	entity_id?: string | number | null
	meta?: Record<string, unknown> | null
}

export async function logAdminAction(input: AdminAuditInput) {
	try {
		await prisma.adminAuditLog.create({
			data: {
				actor_id: input.actor_id ?? null,
				actor_name: input.actor_name ?? '',
				action: input.action,
				entity: input.entity,
				entity_id:
					input.entity_id !== null && input.entity_id !== undefined
						? String(input.entity_id)
						: null,
				meta: (input.meta ?? undefined) as
					| Prisma.InputJsonValue
					| undefined,
			},
		})
	} catch (err) {
		console.error('[Audit] Failed to write admin audit log:', err)
	}
}
