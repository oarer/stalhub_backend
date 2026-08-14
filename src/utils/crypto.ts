import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from 'node:crypto'
import { env } from '@/env'

const PREFIX = 'enc:v1:'

function keyBytes(): Buffer {
	return createHash('sha256').update(env.ENCRYPT_KEY).digest()
}

export function isEncrypted(value: string): boolean {
	return value.startsWith(PREFIX)
}

export function encryptSecret(value: string): string {
	const iv = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv)
	const encrypted = Buffer.concat([
		cipher.update(value, 'utf8'),
		cipher.final(),
	])
	const tag = cipher.getAuthTag()
	return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(value: string): string {
	if (!isEncrypted(value)) return value
	const parts = value.slice(PREFIX.length).split(':')
	if (parts.length !== 3) return value
	const [iv, tag, data] = parts as [string, string, string]
	const decipher = createDecipheriv(
		'aes-256-gcm',
		keyBytes(),
		Buffer.from(iv, 'base64')
	)
	decipher.setAuthTag(Buffer.from(tag, 'base64'))
	return Buffer.concat([
		decipher.update(Buffer.from(data, 'base64')),
		decipher.final(),
	]).toString('utf8')
}

export function decryptSecretJson<T>(value: string): T {
	const decrypted = decryptSecret(value)
	try {
		return JSON.parse(decrypted) as T
	} catch {
		try {
			return JSON.parse(
				Buffer.from(decrypted, 'base64').toString('utf-8')
			) as T
		} catch {
			throw new Error('Failed to decrypt token blob')
		}
	}
}
