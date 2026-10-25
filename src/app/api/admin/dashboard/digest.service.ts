import axios from 'axios'
import { env } from '@/env'
import { dashboardService } from './dashboard.service'

async function postToWebhook(content: string): Promise<boolean> {
	if (!env.ADMIN_ALERT_WEBHOOK) return false
	try {
		await axios.post(
			env.ADMIN_ALERT_WEBHOOK,
			{ content },
			{ timeout: 10_000 }
		)
		return true
	} catch (err) {
		console.error('[Digest] Failed to post admin digest:', err)
		return false
	}
}

const fmt = (n: number) => new Intl.NumberFormat().format(n)

export async function buildDigestMessage(): Promise<string> {
	const s = await dashboardService.summary(7)

	return [
		'**StalHub — дайджест за последние 7 дней**',
		`Пользователи: всего ${fmt(s.users.total)}, новых ${fmt(s.users.new_7d)} (за 24ч: ${fmt(s.users.new_today)}). DAU ${fmt(s.users.dau_24h)} / WAU ${fmt(s.users.wau_7d)}.`,
		`Активность: активных сессий за 24ч ${fmt(s.users.active_sessions_24h)}.`,
		`Контент: сборки ${fmt(s.content.builds.total)} (${fmt(s.content.builds.views)} просмотров), статьи ${fmt(s.content.articles.total)}, арты ${fmt(s.content.arts.total)}, комментариев ${fmt(s.content.comments.total)}.`,
		`Модерация: банов за 7д — ${fmt(s.moderation.bans_7d)}, предупреждений — ${fmt(s.moderation.warnings_7d)}, автобанов ${fmt(s.users.auto_banned)}.`,
		`Статьи на модерации: ${fmt((s.content.articles.by_status.PENDING ?? 0) + (s.content.articles.by_status.REVIEW ?? 0))}.`,
	].join('\n')
}

export async function sendAdminDigest() {
	const message = await buildDigestMessage()
	return postToWebhook(message)
}
