import { prisma } from '@/lib/prisma'

export class BoostOrderService {
	private static readonly PERMANENT_DATE = 'permanent'

	async getOrders(clanId: string) {
		const orders = await prisma.clanBoostOrder.findMany({
			where: { clanId, date: BoostOrderService.PERMANENT_DATE },
			include: {
				player: {
					select: { id: true, name: true },
				},
			},
			orderBy: { created_at: 'asc' },
		})
		return { orders }
	}

	async addOrder(
		clanId: string,
		playerId: number,
		itemId: string,
		itemName: string,
		count: number
	) {
		const date = BoostOrderService.PERMANENT_DATE

		const clan = await prisma.clan.findUnique({
			where: { id: clanId },
			select: { boost_mode: true },
		})
		if (!clan) throw new Error('Clan not found')
		if (clan.boost_mode === 'SELF') {
			throw new Error('Self-boost mode')
		}

		const member = await prisma.clanMember.findFirst({
			where: { id: playerId, clanId },
		})
		if (!member) throw new Error('Member not found in clan')

		const existing = await prisma.clanBoostOrder.findFirst({
			where: { clanId, playerId, itemId, date },
		})

		if (existing) {
			await prisma.clanBoostOrder.update({
				where: { id: existing.id },
				data: { count: existing.count + count },
			})
		} else {
			await prisma.clanBoostOrder.create({
				data: {
					clanId,
					playerId,
					itemId,
					itemName: itemName.slice(0, 200),
					count,
					date,
				},
			})
		}

		return this.getOrders(clanId)
	}

	async removeOrder(clanId: string, index: number) {
		const orders = await prisma.clanBoostOrder.findMany({
			where: { clanId, date: BoostOrderService.PERMANENT_DATE },
			orderBy: { created_at: 'asc' },
		})
		if (orders[index]) {
			await prisma.clanBoostOrder.delete({
				where: { id: orders[index].id },
			})
		}
		return this.getOrders(clanId)
	}
}

export const boostOrderService = new BoostOrderService()
