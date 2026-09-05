import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from 'node:crypto'

const IV_LENGTH = 12

export interface EncryptedPayload {
	alg: 'AES-256-GCM'
	iv: string
	tag: string
	data: string
}

export function deriveKey(masterKey: string): Buffer {
	if (/^[0-9a-fA-F]{64}$/.test(masterKey)) {
		return Buffer.from(masterKey, 'hex')
	}

	if (/^[A-Za-z0-9+/]{43}=$/.test(masterKey)) {
		const decoded = Buffer.from(masterKey, 'base64')
		if (decoded.length === 32) {
			return decoded
		}
	}

	return createHash('sha256').update(masterKey, 'utf8').digest()
}

export function encryptBuffer(
	buffer: Buffer,
	masterKey: string
): EncryptedPayload {
	const key = deriveKey(masterKey)
	const iv = randomBytes(IV_LENGTH)
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
	const tag = cipher.getAuthTag()

	return {
		alg: 'AES-256-GCM',
		iv: iv.toString('base64'),
		tag: tag.toString('base64'),
		data: encrypted.toString('base64'),
	}
}

export function decryptPayload(
	payload: EncryptedPayload,
	masterKey: string
): Buffer {
	const key = deriveKey(masterKey)
	const iv = Buffer.from(payload.iv, 'base64')
	const tag = Buffer.from(payload.tag, 'base64')
	const data = Buffer.from(payload.data, 'base64')

	const decipher = createDecipheriv('aes-256-gcm', key, iv)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(data), decipher.final()])
}
