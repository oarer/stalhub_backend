import { prisma } from '@/lib/prisma'

export class BoostOrderService {
	private static readonly PERMANENT_DATE = 'permanent'

	async getOrders(clan_id: string) {
		const orders = await prisma.clanBoostOrder.findMany({
			where: { clan_id, date: BoostOrderService.PERMANENT_DATE },
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
		clan_id: string,
		player_id: number,
		item_id: string,
		item_name: string,
		count: number
	) {
		const date = BoostOrderService.PERMANENT_DATE

		const clan = await prisma.clan.findUnique({
			where: { id: clan_id },
			select: { boost_mode: true },
		})
		if (!clan) throw new Error('Clan not found')
		if (clan.boost_mode === 'SELF') {
			throw new Error('Self-boost mode')
		}

		const member = await prisma.clanMember.findFirst({
			where: { id: player_id, clan_id },
		})
		if (!member) throw new Error('Member not found in clan')

		const existing = await prisma.clanBoostOrder.findFirst({
			where: { clan_id, player_id, item_id, date },
		})

		if (existing) {
			await prisma.clanBoostOrder.update({
				where: { id: existing.id },
				data: { count: existing.count + count },
			})
		} else {
			await prisma.clanBoostOrder.create({
				data: {
					clan_id,
					player_id,
					item_id,
					item_name: item_name.slice(0, 200),
					count,
					date,
				},
			})
		}

		return this.getOrders(clan_id)
	}

	async removeOrder(clan_id: string, index: number) {
		const orders = await prisma.clanBoostOrder.findMany({
			where: { clan_id, date: BoostOrderService.PERMANENT_DATE },
			orderBy: { created_at: 'asc' },
		})
		if (orders[index]) {
			await prisma.clanBoostOrder.delete({
				where: { id: orders[index].id },
			})
		}
		return this.getOrders(clan_id)
	}
}

export const boostOrderService = new BoostOrderService()
