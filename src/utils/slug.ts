const CYRILLIC_MAP: Record<string, string> = {
	а: 'a',
	б: 'b',
	в: 'v',
	г: 'g',
	д: 'd',
	е: 'e',
	ё: 'yo',
	ж: 'zh',
	з: 'z',
	и: 'i',
	й: 'y',
	к: 'k',
	л: 'l',
	м: 'm',
	н: 'n',
	о: 'o',
	п: 'p',
	р: 'r',
	с: 's',
	т: 't',
	у: 'u',
	ф: 'f',
	х: 'kh',
	ц: 'ts',
	ч: 'ch',
	ш: 'sh',
	щ: 'shch',
	ъ: '',
	ы: 'y',
	ь: '',
	э: 'e',
	ю: 'yu',
	я: 'ya',
}

const transliterate = (str: string): string =>
	str
		.split('')
		.map((ch) => {
			const lower = ch.toLowerCase()
			const mapped = CYRILLIC_MAP[lower]
			if (mapped === undefined) return ch
			if (ch === ch.toUpperCase() && mapped.length > 0) {
				return mapped[0].toUpperCase() + mapped.slice(1)
			}
			return mapped
		})
		.join('')

export function generateSlug(title: string): string {
	const slug = transliterate(title)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 50)

	const suffix = Math.floor(100 + Math.random() * 900)
	return `${slug}-${suffix}`
}
