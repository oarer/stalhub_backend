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
		clan_id: string,
		created_by: string,
		nickname: string
	) {
		const name = nickname.trim()
		if (!name) throw new Error('Nickname is required')

		const clan = await prisma.clan.findUnique({
			where: { id: clan_id },
			select: { id: true, name: true, tag: true, region: true },
		})
		if (!clan) throw new Error('Clan not found')

		const member = await prisma.clanMember.findFirst({
			where: { clan_id, name: { equals: name, mode: 'insensitive' } },
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
						user_id: user.id,
						created_by: created_by,
					},
				})
				await prisma.userClanProfile.upsert({
					where: { user_id_clan_id: { user_id: user.id, clan_id: clan.id } },
					create: {
						user_id: user.id,
						clan_id: clan.id,
						region: clan.region ?? 'RU',
						is_active: true,
					},
					update: { region: clan.region ?? 'RU' },
				})
				await prisma.clanMember.updateMany({
					where: {
						clan_id: clan.id,
						name: { equals: name, mode: 'insensitive' },
					},
					data: { user_id: user.id },
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
		clan_id: string,
		created_by: string,
		nicknames: string[]
	) {
		const results = []
		for (const raw of nicknames) {
			const nickname = raw.trim()
			if (!nickname) continue
			try {
				const created = await this.createGuestAccount(
					clan_id,
					created_by,
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

	async listByClan(clan_id: string) {
		return prisma.clanInvite.findMany({
			where: { clan_id: clan_id },
			include: {
				user: { select: { id: true, username: true, name: true } },
			},
			orderBy: { created_at: 'desc' },
		})
	}

	async revoke(invite_id: number) {
		const invite = await prisma.clanInvite.findUnique({
			where: { id: invite_id },
			select: { user_id: true },
		})
		if (!invite) throw new Error('Invite not found')
		await prisma.$transaction([
			prisma.clanInvite.delete({ where: { id: invite_id } }),
			prisma.user.delete({ where: { id: invite.user_id } }),
		])
		return { ok: true }
	}

	async kickGuest(clan_id: string, user_id: number) {
		await prisma.$transaction([
			prisma.userClanProfile.deleteMany({
				where: { user_id, clan_id },
			}),
			prisma.clanMember.updateMany({
				where: { user_id, clan_id },
				data: { user_id: null },
			}),
			prisma.clanInvite.deleteMany({ where: { user_id } }),
			prisma.user.delete({ where: { id: user_id } }),
		])
		return { ok: true }
	}

	async claim(code: string, claimed_by: string) {
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

		const hasActive = await prisma.userClanProfile.findFirst({
				where: { user_id: invite.user_id, is_active: true },
				select: { user_id: true },
			})
			await prisma.$transaction([
				prisma.clanInvite.update({
					where: { id: invite.id },
					data: { claimed_by: claimed_by, claimed_at: new Date() },
				}),
				prisma.userClanProfile.upsert({
					where: {
						user_id_clan_id: { user_id: invite.user_id, clan_id: clan.id },
					},
					create: {
						user_id: invite.user_id,
						clan_id: clan.id,
						region: clan.region ?? 'RU',
						is_active: !hasActive,
					},
					update: { region: clan.region ?? 'RU' },
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
