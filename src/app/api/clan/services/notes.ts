import { prisma } from '@/lib/prisma'

export class NotesService {
	async listAll(clanId: string) {
		return prisma.clanMemberNote.findMany({
			where: { clanId },
			include: {
				author: { select: { id: true, username: true, name: true } },
				member: { select: { id: true, name: true } },
			},
			orderBy: { created_at: 'desc' },
		})
	}

	async upsert(clanId: string, authorId: number, memberId: number, content: string) {
		const member = await prisma.clanMember.findFirst({
			where: { id: memberId, clanId },
		})
		if (!member) throw new Error('Участник не найден в клане')

		const existing = await prisma.clanMemberNote.findUnique({
			where: { memberId },
		})

		if (existing) {
			return prisma.clanMemberNote.update({
				where: { id: existing.id },
				data: { content: content.slice(0, 512), authorId },
				include: {
					author: { select: { id: true, username: true, name: true } },
				},
			})
		}

		return prisma.clanMemberNote.create({
			data: { clanId, authorId, memberId, content: content.slice(0, 512) },
			include: {
				author: { select: { id: true, username: true, name: true } },
			},
		})
	}

	async update(noteId: number, content: string) {
		const note = await prisma.clanMemberNote.findUnique({ where: { id: noteId } })
		if (!note) throw new Error('Заметка не найдена')

		return prisma.clanMemberNote.update({
			where: { id: noteId },
			data: { content: content.slice(0, 512) },
			include: {
				author: { select: { id: true, username: true, name: true } },
			},
		})
	}

	async delete(noteId: number) {
		const note = await prisma.clanMemberNote.findUnique({ where: { id: noteId } })
		if (!note) throw new Error('Заметка не найдена')

		await prisma.clanMemberNote.delete({ where: { id: noteId } })
		return { ok: true }
	}
}

export const notesService = new NotesService()
