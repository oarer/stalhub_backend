import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { StageType } from 'generated/prisma/enums'
import { MSK_OFFSET_MS } from '@/lib/msk'
import { prisma } from '@/lib/prisma'
import type { AIScreenshotResult } from '../types'
import { analyzeScreenshot } from './ai'
import { buildAttendanceMonth, mskMonthRange } from './attendance-month'
import { applySessionRating, deleteSessionWithRating } from './rating'

function mskDayRange(date: string): [Date, Date] {
	const [y, m, d] = date.split('-').map(Number)
	const start = Date.UTC(y, m - 1, d, 0, 0, 0) - MSK_OFFSET_MS
	return [new Date(start), new Date(start + 24 * 60 * 60 * 1000)]
}

const UPLOAD_DIR = path.resolve('uploads', 'screenshots')

class AnalyticsService {
	private async ensureUploadDir() {
		await mkdir(UPLOAD_DIR, { recursive: true })
	}

	async createSession(input: {
		creator_id: number | null
		region: string
		map_name: string
		type?: string
		clan_id?: string
		started_at?: string
		stage_number?: number | null
	}) {
		return prisma.stageSession.create({
			data: {
				region: input.region,
				map_name: input.map_name,
				type: (input.type as never) ?? 'TOURNAMENT',
				creator_id: input.creator_id,
				clan_id: input.clan_id,
				stage_number: input.stage_number ?? null,
				...((input.started_at as string | undefined) && {
					started_at: new Date(input.started_at as string),
				}),
			},
		})
	}

	async getOrCreateStageSession(input: {
		clan_id: string
		region: string
		type: string
		stage: number
		date: string
	}) {
		const [from, to] = mskDayRange(input.date)
		const existing = await prisma.stageSession.findFirst({
			where: {
				clan_id: input.clan_id,
				type: input.type as never,
				stage_number: input.stage,
				started_at: { gte: from, lt: to },
			},
		})
		if (existing) return existing

		return prisma.stageSession.create({
			data: {
				region: input.region,
				map_name: `Этап ${input.stage}`,
				type: input.type as never,
				clan_id: input.clan_id,
				stage_number: input.stage,
				creator_id: null,
				started_at: new Date(from),
			},
		})
	}

	async addScreenshot(
		session_id: number,
		clan_id: string,
		file: { name: string; type: string; buffer: Buffer }
	) {
		const session = await prisma.stageSession.findFirst({
			where: { id: session_id, clan_id },
			select: { id: true },
		})
		if (!session) throw new Error('Session not found for this clan')
		const existing = await prisma.stageScreenshot.count({
			where: { session_id },
		})
		if (existing > 0) {
			throw new Error('Only one screenshot per stage is allowed')
		}
		await this.ensureUploadDir()
		const ext = path.extname(file.name) || '.png'
		const filename = `${session_id}-${randomUUID()}${ext}`
		const fullPath = path.join(UPLOAD_DIR, filename)
		const relativePath = path.join('uploads', 'screenshots', filename)
		await writeFile(fullPath, file.buffer)

		const row = await prisma.stageScreenshot.create({
			data: {
				session_id,
				file_path: relativePath,
				mime_type: file.type,
				size_bytes: file.buffer.length,
			},
		})
		void this.runAnalysis(row.id, fullPath)
		return row
	}

	async runAnalysis(screenshot_id: number, file_path: string) {
		await prisma.stageScreenshot.update({
			where: { id: screenshot_id },
			data: { ai_status: 'processing' },
		})
		try {
			const shot = await prisma.stageScreenshot.findUnique({
				where: { id: screenshot_id },
				include: {
					session: { select: { clan_id: true, stage_number: true } },
				},
			})
			const roster = shot?.session.clan_id
				? (
						await prisma.clanMember.findMany({
							where: { clan_id: shot.session.clan_id },
							select: { name: true, rank: true },
						})
					).map((m) => ({ name: m.name, role: m.rank }))
				: undefined
			const result = await analyzeScreenshot(
				file_path,
				roster,
				shot?.session.stage_number
			)
			await prisma.stageScreenshot.update({
				where: { id: screenshot_id },
				data: {
					ai_status: 'done',
					ai_error: null,
					ai_result: result as never,
				},
			})
			if (result.map_name) {
				const shot = await prisma.stageScreenshot.findUnique({
					where: { id: screenshot_id },
					select: { session_id: true },
				})
				if (shot) {
					await prisma.stageSession.update({
						where: { id: shot.session_id },
						data: {
							map_name: result.map_name.split('#')[0].trim(),
						},
					})
				}
			}
			await this.applyAttendanceFromAI(screenshot_id, result)
			await this.regenerateSummary(screenshot_id)
		} catch (err) {
			await prisma.stageScreenshot.update({
				where: { id: screenshot_id },
				data: { ai_status: 'error', ai_error: (err as Error).message },
			})
		}
	}

	private async applyAttendanceFromAI(
		screenshot_id: number,
		result: AIScreenshotResult
	) {
		const screenshot = await prisma.stageScreenshot.findUnique({
			where: { id: screenshot_id },
			include: { session: true },
		})
		if (!screenshot?.session.clan_id) return

		const members = await prisma.clanMember.findMany({
			where: { clan_id: screenshot.session.clan_id },
		})

		const session_id = screenshot.session_id

		for (const m of members) {
			const present = result.players.some(
				(p) => p.name.trim().toLowerCase() === m.name.toLowerCase()
			)
			const existing = await prisma.stageAttendance.findUnique({
				where: { session_id_name: { session_id, name: m.name } },
				select: { source: true },
			})
			if (existing?.source === 'manual') continue
			await prisma.stageAttendance.upsert({
				where: { session_id_name: { session_id, name: m.name } },
				create: {
					session_id,
					name: m.name,
					user_id: m.user_id,
					status: present ? 'PRESENT' : 'ABSENT',
					source: 'ai',
				},
				update: {
					user_id: m.user_id,
					status: present ? 'PRESENT' : 'ABSENT',
					source: 'ai',
				},
			})
		}
	}

	async getSession(id: number) {
		const data = await prisma.stageSession.findUnique({
			where: { id },
			include: {
				screenshots: {
					select: {
						id: true,
						ai_status: true,
						ai_error: true,
						ai_result: true,
						created_at: true,
						file_path: true,
					},
				},
				attendance: {
					include: {
						user: {
							select: { id: true, username: true, name: true },
						},
					},
				},
			},
		})
		if (!data) return null
		const { screenshots, ...rest } = data
		return {
			...rest,
			screenshots: screenshots.map((s) => ({
				id: s.id,
				ai_status: s.ai_status,
				ai_error: s.ai_error,
				created_at: s.created_at,
				file_path: s.file_path,
				victory:
					(s.ai_result as AIScreenshotResult | null)?.victory ?? null,
			})),
		}
	}

	async listSessions(user_id: number, clan_id?: string) {
		const where = clan_id ? { clan_id } : { creator_id: user_id }
		const sessions = await prisma.stageSession.findMany({
			where,
			orderBy: { started_at: 'desc' },
			take: 50,
			include: {
				_count: { select: { screenshots: true, attendance: true } },
				screenshots: {
					where: { ai_status: 'done' },
					select: { ai_result: true },
				},
			},
		})
		return sessions.map(({ screenshots, ...session }) => {
			let wins = 0
			let losses = 0
			for (const shot of screenshots) {
				const r = shot.ai_result as AIScreenshotResult | null
				if (r?.victory === true) wins++
				else if (r?.victory === false) losses++
			}
			const victory = wins > losses ? true : losses > wins ? false : null
			return { ...session, victory }
		})
	}

	async setManualAttendance(
		session_id: number,
		user_id: number,
		status: string,
		note?: string
	) {
		const attendance = await prisma.stageSession.findUnique({
			where: { id: session_id },
			select: { clan_id: true },
		})
		if (!attendance?.clan_id) throw new Error('Clan session not found')
		const member = await prisma.clanMember.findFirst({
			where: { user_id, clan_id: attendance.clan_id },
		})
		if (!member) throw new Error('Clan member not found for this user')
		return prisma.stageAttendance.upsert({
			where: { session_id_name: { session_id, name: member.name } },
			create: {
				session_id,
				name: member.name,
				user_id,
				status: status as never,
				source: 'manual',
				note,
			},
			update: { status: status as never, source: 'manual', note },
		})
	}

	async deleteSession(
		session_id: number,
		clan_id?: string,
		user_id?: number
	) {
		const session = await prisma.stageSession.findUnique({
			where: { id: session_id },
			include: { screenshots: { select: { file_path: true } } },
		})
		if (!session) throw new Error('Session not found')
		if (session.clan_id && session.clan_id !== clan_id) {
			throw new Error('Not your clan session')
		}
		if (!session.clan_id && session.creator_id !== user_id) {
			throw new Error('Not your session')
		}
		for (const shot of session.screenshots) {
			try {
				await rm(shot.file_path, { force: true })
			} catch {}
		}
		return deleteSessionWithRating(session_id)
	}

	async retryAnalysis(screenshot_id: number, clan_id: string) {
		const shot = await prisma.stageScreenshot.findUnique({
			where: { id: screenshot_id },
			include: { session: { select: { clan_id: true } } },
		})
		if (!shot || shot.session.clan_id !== clan_id)
			throw new Error('Screenshot not found for this clan')
		if (shot.ai_status === 'processing') return shot

		await this.runAnalysis(screenshot_id, shot.file_path)
		return prisma.stageScreenshot.findUnique({
			where: { id: screenshot_id },
		})
	}

	async attendanceSummary(
		clan_id: string,
		type?: StageType,
		from?: string | null
	) {
		const sessions = await prisma.stageSession.findMany({
			where: {
				clan_id,
				...(type ? { type } : {}),
				...(from ? { started_at: { gte: new Date(from) } } : {}),
			},
			select: { id: true },
		})
		if (sessions.length === 0) return { sessions: 0, members: [] }

		const rows = await prisma.stageAttendance.groupBy({
			by: ['name', 'status'],
			where: { session_id: { in: sessions.map((s) => s.id) } },
			_count: { _all: true },
		})

		const byMember = new Map<
			string,
			{ present: number; absent: number; late: number; excused: number }
		>()
		for (const r of rows) {
			const entry = byMember.get(r.name) ?? {
				present: 0,
				absent: 0,
				late: 0,
				excused: 0,
			}
			const n = r._count._all
			if (r.status === 'PRESENT') entry.present += n
			else if (r.status === 'ABSENT') entry.absent += n
			else if (r.status === 'LATE') entry.late += n
			else if (r.status === 'EXCUSED') entry.excused += n
			byMember.set(r.name, entry)
		}

		return {
			sessions: sessions.length,
			members: [...byMember.entries()].map(([name, v]) => ({
				name,
				...v,
			})),
		}
	}

	async attendanceMonth(clan_id: string, month: string) {
		const [from, to] = mskMonthRange(month)
		const [members, sessions, absences] = await Promise.all([
			prisma.clanMember.findMany({
				where: { clan_id },
				select: { name: true, user_id: true },
				orderBy: { name: 'asc' },
			}),
			prisma.stageSession.findMany({
				where: { clan_id, started_at: { gte: from, lt: to } },
				select: {
					id: true,
					type: true,
					stage_number: true,
					started_at: true,
					attendance: {
						select: {
							name: true,
							user_id: true,
							status: true,
							note: true,
						},
					},
				},
			}),
			prisma.absence.findMany({
				where: {
					clan_id,
					date: { gte: `${month}-01`, lte: `${month}-31` },
				},
				select: { user_id: true, date: true, note: true, events: true },
			}),
		])

		return buildAttendanceMonth({
			month,
			members,
			sessions,
			absences: absences.map((absence) => ({
				...absence,
				events: absence.events as Array<{
					event_type: string
					stages?: number[]
				}>,
			})),
		})
	}

	async getRawStats(clan_id: string) {
		const sessions = await prisma.stageSession.findMany({
			where: { clan_id },
			orderBy: { started_at: 'desc' },
			include: {
				screenshots: {
					where: { ai_status: 'done' },
					select: {
						id: true,
						ai_result: true,
						created_at: true,
					},
					orderBy: { created_at: 'asc' },
				},
			},
		})
		return {
			sessions: sessions.map((s) => ({
				id: s.id,
				map_name: s.map_name,
				type: s.type,
				started_at: s.started_at,
				screenshots: s.screenshots.map((shot) => {
					const r = shot.ai_result as AIScreenshotResult | null
					return {
						id: shot.id,
						victory: r?.victory ?? null,
						players: r?.players ?? [],
					}
				}),
			})),
		}
	}

	async regenerateSummary(screenshot_id: number) {
		const screenshot = await prisma.stageScreenshot.findUnique({
			where: { id: screenshot_id },
			select: { session_id: true },
		})
		if (!screenshot) return

		const screenshots = await prisma.stageScreenshot.findMany({
			where: { session_id: screenshot.session_id },
			select: { id: true, ai_status: true, ai_result: true },
		})
		const done = screenshots.filter((s) => s.ai_status === 'done')
		if (
			done.length === 0 ||
			screenshots.some((s) => s.ai_status !== 'done')
		)
			return

		const byPlayer = new Map<
			string,
			{
				name: string
				kills: number
				deaths: number
				assists: number
				score: number
				appearances: number
				best_kills: number
				role: string | null
			}
		>()
		const scoreCounts = new Map<number, number>()
		const opponentScoreCounts = new Map<number, number>()
		let total_score: number | null = null
		let opponent_score: number | null = null
		const screens: Array<{ screenshot_id: number; score: number | null }> =
			[]

		for (const s of done) {
			const r = s.ai_result as AIScreenshotResult | null
			if (!r) continue
			if (r.total_score != null) {
				scoreCounts.set(
					r.total_score,
					(scoreCounts.get(r.total_score) ?? 0) + 1
				)
			}
			if (r.opponent_score != null) {
				opponentScoreCounts.set(
					r.opponent_score,
					(opponentScoreCounts.get(r.opponent_score) ?? 0) + 1
				)
			}
			screens.push({ screenshot_id: s.id, score: r.total_score ?? null })
			for (const p of r.players ?? []) {
				const key = p.name.trim().toLowerCase()
				const entry = byPlayer.get(key) ?? {
					name: p.name.trim(),
					kills: 0,
					deaths: 0,
					assists: 0,
					score: 0,
					appearances: 0,
					best_kills: 0,
					role: null,
				}
				entry.kills += p.kills ?? 0
				entry.deaths += p.deaths ?? 0
				entry.assists += p.assists ?? 0
				entry.score += p.score ?? 0
				entry.appearances += 1
				entry.best_kills = Math.max(entry.best_kills, p.kills ?? 0)
				entry.role = p.role ?? entry.role
				byPlayer.set(key, entry)
			}
		}

		const players = [...byPlayer.values()].sort(
			(a, b) => b.kills - a.kills || b.score - a.score
		)

		let wins = 0
		let losses = 0
		for (const s of done) {
			const r = s.ai_result as AIScreenshotResult | null
			if (!r) continue
			if (r.victory === true) wins++
			else if (r.victory === false) losses++
		}

		if (scoreCounts.size > 0) {
			total_score = [...scoreCounts.entries()].sort(
				(a, b) => b[1] - a[1]
			)[0][0]
		}
		if (opponentScoreCounts.size > 0) {
			opponent_score = [...opponentScoreCounts.entries()].sort(
				(a, b) => b[1] - a[1]
			)[0][0]
		}

		const teamMap = new Map<
			string,
			{ name: string; score: number | null; is_player_clan: boolean }
		>()
		for (const s of done) {
			const r = s.ai_result as AIScreenshotResult | null
			for (const t of r?.teams ?? []) {
				if (!t.name) continue
				const key = t.name.trim().toLowerCase()
				const existing = teamMap.get(key)
				if (!existing) {
					teamMap.set(key, {
						name: t.name.trim(),
						score: t.score ?? null,
						is_player_clan: t.is_player_clan,
					})
				} else {
					if (existing.score == null && t.score != null)
						existing.score = t.score
					existing.is_player_clan =
						existing.is_player_clan || t.is_player_clan
				}
			}
		}
		if (opponent_score == null && teamMap.size > 0) {
			const opp = [...teamMap.values()].find(
				(t) => !t.is_player_clan && t.score != null
			)
			opponent_score = opp?.score ?? null
		}

		const summary = {
			screenshots_analyzed: done.length,
			total_score,
			opponent_score,
			teams: [...teamMap.values()],
			screens,
			players,
			victory: wins > losses ? true : losses > wins ? false : null,
			generated_at: new Date().toISOString(),
		}
		await prisma.stageSession.update({
			where: { id: screenshot.session_id },
			data: { ai_summary: summary as never },
		})
		await applySessionRating(screenshot.session_id, summary.victory)
	}
}
export const analyticsService = new AnalyticsService()
