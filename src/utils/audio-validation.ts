const BYTES_PER_MB = 1024 * 1024

export const AUDIO_UPLOAD_MAX_BYTES = 8 * BYTES_PER_MB

export const AUDIO_MIME_EXTENSIONS = {
	'audio/mpeg': '.mp3',
	'audio/ogg': '.ogg',
	'audio/wav': '.wav',
	'audio/mp4': '.m4a',
	'audio/aac': '.aac',
	'audio/flac': '.flac',
} as const

export type AudioMime = keyof typeof AUDIO_MIME_EXTENSIONS

/**
 * Валидация загружаемого аудио: сигнатура решает, имя файла — нет.
 * MP3 может начинаться с ID3v2-тега, поэтому ищем его до raw-фрейма.
 */
export function validateAudioUpload(buffer: Buffer): {
	mime: AudioMime
	ext: string
} {
	if (!buffer.length || buffer.length > AUDIO_UPLOAD_MAX_BYTES)
		throw new Error(
			`Audio must be between 1 byte and ${AUDIO_UPLOAD_MAX_BYTES / BYTES_PER_MB} MB`
		)

	const mime = detectAudioMime(buffer)
	if (!mime) throw new Error('Only mp3/wav/ogg/m4a/aac/flac audio is allowed')
	return { mime, ext: AUDIO_MIME_EXTENSIONS[mime] }
}

export function detectAudioMime(buffer: Buffer): AudioMime | null {
	if (buffer.length < 12) return null

	const head = buffer.subarray(0, 12)

	// ID3v2 — почти всегда mp3
	if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33)
		return 'audio/mpeg'

	// raw MPEG frame sync (0xFF Ex/Fx)
	if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'audio/mpeg'

	const ascii = (from: number, to: number) =>
		String.fromCharCode(...buffer.subarray(from, to))

	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav'
	if (ascii(0, 4) === 'OggS') return 'audio/ogg'
	if (ascii(4, 8) === 'ftyp') return 'audio/mp4'
	if (buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0) return 'audio/aac'
	if (ascii(0, 4) === 'fLaC') return 'audio/flac'

	return null
}
