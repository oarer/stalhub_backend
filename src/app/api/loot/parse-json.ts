export function stripJsonComments(raw: string): string {
	let text = raw
	if (text.charCodeAt(0) === 0xfeff) {
		text = text.slice(1)
	}

	const out: string[] = []
	let i = 0
	const n = text.length
	let inString = false

	while (i < n) {
		const c = text[i]

		if (inString) {
			out.push(c)
			if (c === '\\' && i + 1 < n) {
				out.push(text[i + 1])
				i += 2
				continue
			}
			if (c === '"') {
				inString = false
			}
			i += 1
			continue
		}

		if (c === '"') {
			inString = true
			out.push(c)
			i += 1
			continue
		}

		if (c === '/' && text[i + 1] === '/') {
			while (i < n && text[i] !== '\n') {
				i += 1
			}
			continue
		}

		if (c === '/' && text[i + 1] === '*') {
			i += 2
			while (i + 1 < n && !(text[i] === '*' && text[i + 1] === '/')) {
				i += 1
			}
			i += 2
			continue
		}

		out.push(c)
		i += 1
	}

	return out.join('')
}

export function parseJsonObject<T = unknown>(raw: string): T {
	return JSON.parse(stripJsonComments(raw)) as T
}
