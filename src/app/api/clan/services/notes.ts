import { prisma } from '@/lib/prisma'

export class NotesService {
	async listAll(clan_id: string) {
		return prisma.clanMemberNote.findMany({
			where: { clan_id },
			include: {
				author: { select: { id: true, username: true, name: true } },
				member: { select: { id: true, name: true } },
			},
			orderBy: { created_at: 'desc' },
		})
	}

	async upsert(clan_id: string, author_id: number, member_id: number, content: string) {
		const member = await prisma.clanMember.findFirst({
			where: { id: member_id, clan_id },
		})
		if (!member) throw new Error('Участник не найден в клане')

		const existing = await prisma.clanMemberNote.findUnique({
			where: { member_id },
		})

		if (existing) {
			return prisma.clanMemberNote.update({
				where: { id: existing.id },
				data: { content: content.slice(0, 512), author_id },
				include: {
					author: { select: { id: true, username: true, name: true } },
				},
			})
		}

		return prisma.clanMemberNote.create({
			data: { clan_id, author_id, member_id, content: content.slice(0, 512) },
			include: {
				author: { select: { id: true, username: true, name: true } },
			},
		})
	}

	async update(note_id: number, content: string) {
		const note = await prisma.clanMemberNote.findUnique({ where: { id: note_id } })
		if (!note) throw new Error('Заметка не найдена')

		return prisma.clanMemberNote.update({
			where: { id: note_id },
			data: { content: content.slice(0, 512) },
			include: {
				author: { select: { id: true, username: true, name: true } },
			},
		})
	}

	async delete(note_id: number) {
		const note = await prisma.clanMemberNote.findUnique({ where: { id: note_id } })
		if (!note) throw new Error('Заметка не найдена')

		await prisma.clanMemberNote.delete({ where: { id: note_id } })
		return { ok: true }
	}
}

export const notesService = new NotesService()
