/**
 * Одноразовая перезашивка секретов после смены ENCRYPT_KEY.
 *
 * Было: секреты шифровались старым ключом (например, дефолт 'dev'),
 * стало: ключ заменён. Скрипт расшифровывает строки старым ключом
 * и перезаписывает их новым текущим ENCRYPT_KEY.
 *
 * Охват:
 *   - scApiToken  (sc_api_tokens.token_encrypted, обновляет token_tail)
 *   - scApiNode   (sc_api_nodes.api_key)
 *   - eXBOAuth    (token_blob)
 *
 * Запуск:
 *   OLD_ENCRYPT_KEY=dev bun run scripts/reencrypt-secrets.ts
 *   OLD_ENCRYPT_KEY=dev DRY_RUN=1 bun run scripts/reencrypt-secrets.ts
 */
import 'dotenv/config'
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '@/env'
import { prisma } from '@/lib/prisma'

function keyFrom(value: string): Buffer {
	return createHash('sha256').update(value).digest()
}

const PREFIX = 'enc:v1:'

const newKey = keyFrom(env.ENCRYPT_KEY)
const oldKey = keyFrom(process.env.OLD_ENCRYPT_KEY ?? '')

if (!process.env.OLD_ENCRYPT_KEY) {
	console.error('Usage: OLD_ENCRYPT_KEY=<старое-значение> bun run scripts/reencrypt-secrets.ts')
	process.exit(1)
}

function tryDecrypt(value: string, key: Buffer): string | null {
	if (!value.startsWith(PREFIX)) return null
	const parts = value.slice(PREFIX.length).split(':')
	if (parts.length !== 3) return null
	const [ivB64, tagB64, dataB64] = parts
	try {
		const decipher = createDecipheriv(
			'aes-256-gcm',
			key,
			Buffer.from(ivB64, 'base64')
		)
		decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
		return Buffer.concat([
			decipher.update(Buffer.from(dataB64, 'base64')),
			decipher.final(),
		]).toString('utf8')
	} catch {
		return null
	}
}

function encrypt(value: string, key: Buffer): string {
	const iv = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
	const tag = cipher.getAuthTag()
	return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

const dryRun = process.env.DRY_RUN === '1'

interface Row {
	id: number
	column: string
}

/**
 * Перезашивает строки одной таблицы: decrypt(oldKey) -> encrypt(newKey).
 * Уже перезашитые новым ключом пропускает, нерасшифровываемые — бракует.
 */
async function reencryptTable(
	name: string,
	rows: Row[],
	write: (id: number, encrypted: string, plaintext: string) => Promise<unknown>
): Promise<{ migrated: number; alreadyNew: number; failed: number }> {
	let migrated = 0
	let alreadyNew = 0
	let failed = 0

	for (const row of rows) {
		const decrypted = tryDecrypt(row.column, oldKey)
		if (decrypted === null) {
			const withNew = tryDecrypt(row.column, newKey)
			if (withNew !== null) {
				alreadyNew++
				continue
			}
			failed++
			console.warn(`[${name}] id=${row.id}: не расшифровывается ни одним ключом`)
			continue
		}
		const reencrypted = encrypt(decrypted, newKey)
		if (dryRun) {
			migrated++
			continue
		}
		await write(row.id, reencrypted, decrypted)
		migrated++
	}

	console.log(
		`[${name}] проверено=${rows.length} перезашито=${dryRun ? `${migrated} (dry run)` : migrated} уже-новым=${alreadyNew} битых=${failed}`
	)
	if (failed > 0) {
		console.warn(`[${name}] ${failed} битых строк — проверь вручную: bun run scripts/decrypt-secret.ts <значение>`)
	}
	return { migrated, alreadyNew, failed }
}

async function main() {
	console.log(
		`Перезашивка ${dryRun ? '(DRY RUN) ' : ''}со старым ключом (hash=${oldKey.toString('hex').slice(0, 12)}…) на новый (hash=${newKey.toString('hex').slice(0, 12)}…)`
	)

	if (oldKey.equals(newKey)) {
		console.warn('OLD_ENCRYPT_KEY совпадает с текущим ENCRYPT_KEY — делать нечего.')
		await prisma.$disconnect()
		return
	}

	const [tokens, nodes, exboAuths] = await Promise.all([
		prisma.scApiToken.findMany({ select: { id: true, token_encrypted: true } }),
		prisma.scApiNode.findMany({ select: { id: true, api_key: true } }),
		prisma.eXBOAuth.findMany({ select: { id: true, token_blob: true } }),
	])

	const results = await Promise.all([
		reencryptTable(
			'scApiToken',
			tokens.map((r) => ({ id: r.id, column: r.token_encrypted })),
			(id, encrypted, plaintext) =>
				prisma.scApiToken.update({
					where: { id },
					data: { token_encrypted: encrypted, token_tail: plaintext.slice(-6) },
				})
		),
		reencryptTable(
			'scApiNode',
			nodes.map((r) => ({ id: r.id, column: r.api_key })),
			(id, encrypted) =>
				prisma.scApiNode.update({
					where: { id },
					data: { api_key: encrypted },
				})
		),
		reencryptTable(
			'eXBOAuth.token_blob',
			exboAuths.map((r) => ({ id: r.id, column: r.token_blob })),
			(id, encrypted) =>
				prisma.eXBOAuth.update({
					where: { id },
					data: { token_blob: encrypted },
				})
		),
	])

	const total = results.reduce(
		(acc, r) => ({
			migrated: acc.migrated + r.migrated,
			alreadyNew: acc.alreadyNew + r.alreadyNew,
			failed: acc.failed + r.failed,
		}),
		{ migrated: 0, alreadyNew: 0, failed: 0 }
	)

	console.log(
		`Итого: перезашито=${total.migrated} уже-новым=${total.alreadyNew} битых=${total.failed}${dryRun ? ' (DRY RUN — ничего не записано)' : ''}`
	)
	await prisma.$disconnect()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
