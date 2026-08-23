export {}

const [clan_id, nick, intervalArg] = process.argv.slice(2)

if (!clan_id || !nick) {
	console.log('Usage: bun run grenade:test -- <clan_id> <nick> [intervalSec]')
	process.exit(1)
}

const INTERVAL_SEC =
	Number.isFinite(Number(intervalArg)) && Number(intervalArg) > 0
		? Number(intervalArg)
		: 60

function ts() {
	return new Date().toISOString().slice(11, 19)
}

process.env.DATABASE_URL = (process.env.DATABASE_URL ?? '').replace(
	/@postgres:/,
	'@localhost:'
)

type PoolToken = {
	id: number
	login: string
	access_token: string
}

async function main() {
	const { prisma } = await import('@/lib/prisma')
	const { decryptSecretJson } = await import('@/utils/crypto')

	const clan = await prisma.clan.findUnique({
		where: { id: clan_id },
		select: { region: true },
	})
	if (!clan) {
		console.error(`Clan "${clan_id}" not found`)
		process.exit(1)
	}

	const members = await prisma.clanMember.findMany({
		where: { clan_id },
		include: { user: { include: { exbo_auth: true } } },
	})

	const now = new Date()
	const pool: PoolToken[] = []

	for (const m of members) {
		const auth = m.user?.exbo_auth
		if (!auth) continue

		let blob: { access_token: string; refresh_token?: string }
		try {
			blob = decryptSecretJson<{
				access_token: string
				refresh_token?: string
			}>(auth.token_blob)
		} catch {
			console.warn(`[${ts()}] token decrypt failed for auth #${auth.id}`)
			continue
		}
		if (!blob.access_token) continue

		const expired = auth.access_expires_at <= now
		const refreshable =
			auth.refresh_expires_at && auth.refresh_expires_at > now

		if (expired && !refreshable) {
			console.warn(
				`[${ts()}] token #${auth.id} (${auth.login ?? m.name}) expired and not refreshable, skipped`
			)
			continue
		}
		if (expired) {
			console.warn(
				`[${ts()}] token #${auth.id} (${auth.login ?? m.name}) access expired, may fail until refresh`
			)
		}

		pool.push({
			id: auth.id,
			login: auth.login ?? m.name,
			access_token: blob.access_token,
		})
	}

	console.log(
		`[${ts()}] clan "${clan_id}" region=${clan.region}: token pool ${pool.length}/${members.length}`
	)
	if (pool.length === 0) {
		console.error('No usable tokens in clan pool')
		process.exit(1)
	}

	console.log(
		`[${ts()}] tracking "${nick}" by stat gre-thr, interval ${INTERVAL_SEC}s (Ctrl+C to stop)`
	)

	let poolIdx = 0
	let prev: number | null = null

	async function fetchOnce(): Promise<void> {
		const token = pool[poolIdx++ % pool.length]!
		const url = `https://eapi.stalcraft.net/${clan!.region}/character/by-name/${encodeURIComponent(nick!)}/profile`

		let res: { status: number; data: unknown }
		try {
			const { default: axios } = await import('axios')
			res = await axios.get(url, {
				timeout: 10_000,
				proxy: false,
				headers: { Authorization: `Bearer ${token.access_token}` },
			})
		} catch (err) {
			const e = err as {
				response?: { status: number; data?: unknown }
				code?: string
				message?: string
			}
			if (e.response) {
				console.error(
					`[${ts()}] HTTP ${e.response.status} (token #${token.id}): ${JSON.stringify(e.response.data).slice(0, 200)}`
				)
			} else {
				console.error(
					`[${ts()}] request failed: ${e.code ?? ''} ${e.message ?? err}`
				)
			}
			return
		}

		if (res.status !== 200) {
			console.error(`[${ts()}] HTTP ${res.status} (token #${token.id})`)
			return
		}

		const data = res.data as {
			stats: Array<{ id: string; value: number | string }>
		}
		const stat = data.stats.find((s) => s.id === 'gre-thr')
		const total = stat ? Number(stat.value) : 0

		if (prev === null) {
			console.log(`[${ts()}] gre-thr total: ${total}`)
		} else {
			const delta = total - prev
			console.log(
				`[${ts()}] gre-thr total: ${total} (delta ${delta >= 0 ? '+' : ''}${delta})`
			)
		}
		prev = total
	}

	await fetchOnce()
	const timer = setInterval(fetchOnce, INTERVAL_SEC * 1000)

	process.on('SIGINT', () => {
		clearInterval(timer)
		prisma.$disconnect().finally(() => process.exit(0))
	})
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
