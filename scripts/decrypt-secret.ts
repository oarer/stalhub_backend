import { decryptSecret, isEncrypted } from '@/utils/crypto'

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = []
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
	return Buffer.concat(chunks).toString('utf8').trim()
}

const arg = process.argv[2]
const input = arg ?? (process.stdin.isTTY ? '' : await readStdin())

if (!input) {
	console.error(
		'Usage: bun run scripts/decrypt-secret.ts <encrypted-value>\n' +
			"       echo 'enc:v1:...' | bun run scripts/decrypt-secret.ts"
	)
	process.exit(1)
}

if (!isEncrypted(input)) {
	console.error('Value is not encrypted (missing enc:v1: prefix), printing as-is:')
	console.log(input)
	process.exit(0)
}

try {
	const decrypted = decryptSecret(input)
	try {
		console.log(JSON.stringify(JSON.parse(decrypted), null, 2))
	} catch {
		console.log(decrypted)
	}
} catch (err) {
	console.error('Decryption failed (wrong ENCRYPT_KEY or corrupted value):')
	console.error(err)
	process.exit(1)
}
