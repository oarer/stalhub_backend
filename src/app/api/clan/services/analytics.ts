import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { StageType } from 'generated/prisma/enums'
import { MSK_OFFSET_MS } from '@/lib/msk'
import { prisma } from '@/lib/prisma'
import type { AIScreenshotResult } from '../types'
import { analyzeScreenshot } from './ai'

function mskDayRange(date: string): [Date, Date] {
	const [y, m, d] = date.split('-').map(Number)
	const start = Date.UTC(y, m - 1, d, 0, 0, 0) - MSK_OFFSET_MS
	return [new Date(start), new Date(start + 24 * 60 * 60 * 1000)]
}

class AnalyticsService {
	private async ensureUploadDir() {
		await mkdir('./uploads/screenshots', { recursive: true })
	}

	async createSession(input: {
		creatorId: number | null
		region: string
		map_name: string
		type?: string
		clanId?: string
		started_at?: string
		stage_number?: number | null
	}) {
		return prisma.stageSession.create({
			data: {
				region: input.region,
				map_name: input.map_name,
				type: (input.type as never) ?? 'TOURNAMENT',
				creatorId: input.creatorId,
				clanId: input.clanId,
				stage_number: input.stage_number ?? null,
				...((input.started_at as string | undefined) && {
					started_at: new Date(input.started_at as string),
				}),
			},
		})
	}

	async getOrCreateStageSession(input: {
		clanId: string
		region: string
		type: string
		stage: number
		date: string
	}) {
		const [from, to] = mskDayRange(input.date)
		const existing = await prisma.stageSession.findFirst({
			where: {
				clanId: input.clanId,
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
				clanId: input.clanId,
				stage_number: input.stage,
				creatorId: null,
				started_at: new Date(from),
			},
		})
	}

	async addScreenshot(
		sessionId: number,
		file: { name: string; type: string; buffer: Buffer }
	) {
		const existing = await prisma.stageScreenshot.count({
			where: { sessionId },
		})
		if (existing > 0) {
			throw new Error('Only one screenshot per stage is allowed')
		}
		await this.ensureUploadDir()
		const ext = path.extname(file.name) || '.png'
		const filename = `${sessionId}-${randomUUID()}${ext}`
		const fullPath = path.join('./uploads/screenshots', filename)
		await writeFile(fullPath, file.buffer)

		const row = await prisma.stageScreenshot.create({
			data: {
				sessionId,
				file_path: fullPath,
				mime_type: file.type,
				size_bytes: file.buffer.length,
			},
		})
		void this.runAnalysis(row.id, fullPath)
		return row
	}

	async runAnalysis(screenshotId: number, filePath: string) {
		await prisma.stageScreenshot.update({
			where: { id: screenshotId },
			data: { ai_status: 'processing' },
		})
		try {
			const result = await analyzeScreenshot(filePath)
			await prisma.stageScreenshot.update({
				where: { id: screenshotId },
				data: {
					ai_status: 'done',
					ai_error: null,
					ai_result: result as never,
				},
			})
			if (result.mapName) {
				const shot = await prisma.stageScreenshot.findUnique({
					where: { id: screenshotId },
					select: { sessionId: true },
				})
				if (shot) {
					await prisma.stageSession.update({
						where: { id: shot.sessionId },
						data: { map_name: result.mapName.split('#')[0].trim() },
					})
				}
			}
			await this.applyAttendanceFromAI(screenshotId, result)
			await this.regenerateSummary(screenshotId)
		} catch (err) {
			await prisma.stageScreenshot.update({
				where: { id: screenshotId },
				data: { ai_status: 'error', ai_error: (err as Error).message },
			})
		}
	}

	private async applyAttendanceFromAI(
		screenshotId: number,
		result: AIScreenshotResult
	) {
		const screenshot = await prisma.stageScreenshot.findUnique({
			where: { id: screenshotId },
			include: { session: true },
		})
		if (!screenshot?.session.clanId) return

		const members = await prisma.clanMember.findMany({
			where: { clanId: screenshot.session.clanId },
		})

		const sessionId = screenshot.sessionId

		for (const m of members) {
			const present = result.players.some(
				(p) => p.name.trim().toLowerCase() === m.name.toLowerCase()
			)
			await prisma.stageAttendance.upsert({
				where: { sessionId_name: { sessionId, name: m.name } },
				create: {
					sessionId,
					name: m.name,
					userId: m.userId,
					status: present ? 'PRESENT' : 'ABSENT',
					source: 'ai',
				},
				update: {
					userId: m.userId,
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

	async listSessions(userId: number, clanId?: string) {
		const where = clanId ? { clanId } : { creatorId: userId }
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
		sessionId: number,
		userId: number,
		status: string,
		note?: string
	) {
		const member = await prisma.clanMember.findFirst({ where: { userId } })
		if (!member) throw new Error('Clan member not found for this user')
		return prisma.stageAttendance.upsert({
			where: { sessionId_name: { sessionId, name: member.name } },
			create: {
				sessionId,
				name: member.name,
				userId,
				status: status as never,
				source: 'manual',
				note,
			},
			update: { status: status as never, source: 'manual', note },
		})
	}

	async deleteSession(sessionId: number, clanId?: string, userId?: number) {
		const session = await prisma.stageSession.findUnique({
			where: { id: sessionId },
			include: { screenshots: { select: { file_path: true } } },
		})
		if (!session) throw new Error('Session not found')
		if (session.clanId && session.clanId !== clanId) {
			throw new Error('Not your clan session')
		}
		if (!session.clanId && session.creatorId !== userId) {
			throw new Error('Not your session')
		}
		for (const shot of session.screenshots) {
			try {
				await rm(shot.file_path, { force: true })
			} catch {}
		}
		await prisma.stageSession.delete({ where: { id: sessionId } })
		return { ok: true }
	}

	async retryAnalysis(screenshotId: number) {
		const shot = await prisma.stageScreenshot.findUnique({
			where: { id: screenshotId },
		})
		if (!shot) throw new Error('Screenshot not found')
		if (shot.ai_status === 'processing') return shot

		await this.runAnalysis(screenshotId, shot.file_path)
		return prisma.stageScreenshot.findUnique({
			where: { id: screenshotId },
		})
	}

	async attendanceSummary(
		clanId: string,
		type?: StageType,
		from?: string | null
	) {
		const sessions = await prisma.stageSession.findMany({
			where: {
				clanId,
				...(type ? { type } : {}),
				...(from ? { started_at: { gte: new Date(from) } } : {}),
			},
			select: { id: true },
		})
		if (sessions.length === 0) return { sessions: 0, members: [] }

		const rows = await prisma.stageAttendance.groupBy({
			by: ['name', 'status'],
			where: { sessionId: { in: sessions.map((s) => s.id) } },
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

	async getRawStats(clanId: string) {
		const sessions = await prisma.stageSession.findMany({
			where: { clanId },
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
		return sessions.map((s) => ({
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
		}))
	}

	async regenerateSummary(screenshotId: number) {
		const screenshot = await prisma.stageScreenshot.findUnique({
			where: { id: screenshotId },
			select: { sessionId: true },
		})
		if (!screenshot) return

		const screenshots = await prisma.stageScreenshot.findMany({
			where: { sessionId: screenshot.sessionId },
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
				bestKills: number
				role: string | null
			}
		>()
		const scoreCounts = new Map<number, number>()
		const opponentScoreCounts = new Map<number, number>()
		let totalScore: number | null = null
		let opponentScore: number | null = null
		const screens: Array<{ screenshotId: number; score: number | null }> =
			[]

		for (const s of done) {
			const r = s.ai_result as AIScreenshotResult | null
			if (!r) continue
			if (r.totalScore != null) {
				scoreCounts.set(
					r.totalScore,
					(scoreCounts.get(r.totalScore) ?? 0) + 1
				)
			}
			if (r.opponentScore != null) {
				opponentScoreCounts.set(
					r.opponentScore,
					(opponentScoreCounts.get(r.opponentScore) ?? 0) + 1
				)
			}
			screens.push({ screenshotId: s.id, score: r.totalScore ?? null })
			for (const p of r.players ?? []) {
				const key = p.name.trim().toLowerCase()
				const entry = byPlayer.get(key) ?? {
					name: p.name.trim(),
					kills: 0,
					deaths: 0,
					assists: 0,
					score: 0,
					appearances: 0,
					bestKills: 0,
					role: null,
				}
				entry.kills += p.kills ?? 0
				entry.deaths += p.deaths ?? 0
				entry.assists += p.assists ?? 0
				entry.score += p.score ?? 0
				entry.appearances += 1
				entry.bestKills = Math.max(entry.bestKills, p.kills ?? 0)
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
			totalScore = [...scoreCounts.entries()].sort(
				(a, b) => b[1] - a[1]
			)[0][0]
		}
		if (opponentScoreCounts.size > 0) {
			opponentScore = [...opponentScoreCounts.entries()].sort(
				(a, b) => b[1] - a[1]
			)[0][0]
		}

		const teamMap = new Map<
			string,
			{ name: string; score: number | null; isPlayerClan: boolean }
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
						isPlayerClan: t.isPlayerClan,
					})
				} else {
					if (existing.score == null && t.score != null)
						existing.score = t.score
					existing.isPlayerClan =
						existing.isPlayerClan || t.isPlayerClan
				}
			}
		}
		if (opponentScore == null && teamMap.size > 0) {
			const opp = [...teamMap.values()].find(
				(t) => !t.isPlayerClan && t.score != null
			)
			opponentScore = opp?.score ?? null
		}

		const summary = {
			screenshotsAnalyzed: done.length,
			totalScore,
			opponentScore,
			teams: [...teamMap.values()],
			screens,
			players,
			victory: wins > losses ? true : losses > wins ? false : null,
			generatedAt: new Date().toISOString(),
		}
		await prisma.stageSession.update({
			where: { id: screenshot.sessionId },
			data: { ai_summary: summary as never },
		})
	}
}
export const analyticsService = new AnalyticsService()
