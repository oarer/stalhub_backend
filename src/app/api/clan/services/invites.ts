import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/utils/crypto'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const GUEST_USERNAME_PREFIX = 'guest_'

function randomCode(length: number): string {
	const bytes = randomBytes(length)
	let out = ''
	for (let i = 0; i < length; i++) {
		out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
	}
	return out
}

function randomPassword(length: number): string {
	return randomBytes(length).toString('base64url').slice(0, length)
}

async function ensureGuestRole() {
	return prisma.role.upsert({
		where: { name: 'clan_guest' },
		update: {},
		create: {
			name: 'clan_guest',
			description: 'Clan guest (limited access)',
		},
	})
}

class ClanInviteService {
	async createGuestAccount(
		clanId: string,
		createdBy: string,
		nickname: string
	) {
		const name = nickname.trim()
		if (!name) throw new Error('Nickname is required')

		const clan = await prisma.clan.findUnique({
			where: { id: clanId },
			select: { id: true, name: true, tag: true, region: true },
		})
		if (!clan) throw new Error('Clan not found')

		const member = await prisma.clanMember.findFirst({
			where: { clanId, name: { equals: name, mode: 'insensitive' } },
			select: { id: true, name: true },
		})
		if (!member) throw new Error(`"${name}" is not in the clan member list`)

		const guestRole = await ensureGuestRole()
		const username = await this.generateGuestUsername(name)

		for (let attempt = 0; attempt < 5; attempt++) {
			const code = randomCode(8)
			const password = randomPassword(12)
			try {
				const user = await prisma.user.create({
					data: {
						username,
						name,
						password_hash: hashPassword(password),
						onboarded: true,
						roles: { connect: { id: guestRole.id } },
					},
				})
				await prisma.clanInvite.create({
					data: {
						code,
						clan_id: clan.id,
						userId: user.id,
						created_by: createdBy,
					},
				})
				await prisma.userClanProfile.upsert({
					where: { userId: user.id },
					create: {
						userId: user.id,
						clanId: clan.id,
						region: clan.region ?? 'RU',
					},
					update: { clanId: clan.id, region: clan.region ?? 'RU' },
				})
				await prisma.clanMember.updateMany({
					where: {
						clanId: clan.id,
						name: { equals: name, mode: 'insensitive' },
					},
					data: { userId: user.id },
				})
				return {
					code,
					username,
					password,
					clan_id: clan.id,
					user_id: user.id,
					nickname: name,
				}
			} catch (err) {
				const e = err as { code?: string }
				if (e.code === 'P2002') continue
				throw err
			}
		}
		throw new Error('Failed to create guest account')
	}

	async createGuestAccountsBulk(
		clanId: string,
		createdBy: string,
		nicknames: string[]
	) {
		const results = []
		for (const raw of nicknames) {
			const nickname = raw.trim()
			if (!nickname) continue
			try {
				const created = await this.createGuestAccount(
					clanId,
					createdBy,
					nickname
				)
				results.push({ ok: true, ...created })
			} catch (err) {
				results.push({
					ok: false,
					nickname,
					error: (err as Error).message,
				})
			}
		}
		return results
	}

	private async generateGuestUsername(nickname: string): Promise<string> {
		for (let attempt = 0; attempt < 5; attempt++) {
			const candidate = `${GUEST_USERNAME_PREFIX}${nickname}_${randomCode(
				4
			).toLowerCase()}`
			const taken = await prisma.user.findUnique({
				where: { username: candidate },
				select: { id: true },
			})
			if (!taken) return candidate
		}
		throw new Error('Failed to generate unique guest username')
	}

	async listByClan(clanId: string) {
		return prisma.clanInvite.findMany({
			where: { clan_id: clanId },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: { created_at: 'desc' },
		})
	}

	async revoke(inviteId: number) {
		const invite = await prisma.clanInvite.findUnique({
			where: { id: inviteId },
			select: { userId: true },
		})
		if (!invite) throw new Error('Invite not found')
		await prisma.$transaction([
			prisma.clanInvite.delete({ where: { id: inviteId } }),
			prisma.user.delete({ where: { id: invite.userId } }),
		])
		return { ok: true }
	}

	async kickGuest(clanId: string, userId: number) {
		await prisma.$transaction([
			prisma.userClanProfile.deleteMany({
				where: { userId, clanId },
			}),
			prisma.clanMember.updateMany({
				where: { userId, clanId },
				data: { userId: null },
			}),
			prisma.clanInvite.deleteMany({ where: { userId } }),
			prisma.user.delete({ where: { id: userId } }),
		])
		return { ok: true }
	}

	async claim(code: string, claimedBy: string) {
		const normalized = code.trim().toUpperCase()
		const invite = await prisma.clanInvite.findUnique({
			where: { code: normalized },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
		})
		if (!invite) throw new Error('Invalid invite code')
		if (invite.claimed_at) throw new Error('Invite already claimed')

		const clan = await prisma.clan.findUnique({
			where: { id: invite.clan_id },
			select: { id: true, region: true },
		})
		if (!clan) throw new Error('Clan not found')

		await prisma.$transaction([
			prisma.clanInvite.update({
				where: { id: invite.id },
				data: { claimed_by: claimedBy, claimed_at: new Date() },
			}),
			prisma.userClanProfile.upsert({
				where: { userId: invite.userId },
				create: {
					userId: invite.userId,
					clanId: clan.id,
					region: clan.region ?? 'RU',
				},
				update: { clanId: clan.id, region: clan.region ?? 'RU' },
			}),
		])
		return {
			ok: true,
			username: invite.user.username,
			clan_id: clan.id,
		}
	}
}

export const clanInviteService = new ClanInviteService()
