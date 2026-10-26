export const REGIONS = ['RU', 'EU', 'NA', 'SEA', 'NEA'] as const
export type Region = (typeof REGIONS)[number]

export type ParsedQuery =
	| { kind: 'empty' }
	| { kind: 'error'; message: string }
	| { kind: 'player'; character: string; regions: Region[] }
	| { kind: 'item'; name: string }

const regionSet = new Set<string>(REGIONS)
const MAX_CHARACTER_LENGTH = 64
const MAX_ITEM_LENGTH = 64
const ITEM_COMMANDS = new Set(['/i', '/item', '/items', '/i.'])

export function parseInlineQuery(input: string): ParsedQuery {
	const tokens = input.trim().split(/\s+/).filter(Boolean)
	if (tokens[0]?.startsWith('@')) tokens.shift()
	if (tokens.length === 0) return { kind: 'empty' }

	const first = tokens[0].toLowerCase()
	if (ITEM_COMMANDS.has(first)) {
		const name = tokens.slice(1).join(' ').trim()
		if (!name) {
			return {
				kind: 'error',
				message: 'Укажите название предмета: @StalhubBot /i вспышка.',
			}
		}
		if ([...name].length > MAX_ITEM_LENGTH) {
			return {
				kind: 'error',
				message: `Название предмета не должно быть длиннее ${MAX_ITEM_LENGTH} символов.`,
			}
		}
		return { kind: 'item', name }
	}

	if (tokens.length > 2) {
		return {
			kind: 'error',
			message:
				'Формат: имя персонажа и, если нужно, регион (RU, EU, NA, SEA или NEA).',
		}
	}

	const rawRegionToken = tokens[1]
	const regionToken = rawRegionToken
		?.replace(/^\(([^()]*)\)$/, '$1')
		.toUpperCase()
	const character = regionToken ? tokens[0].replace(/,$/, '') : tokens[0]
	if (!character) {
		return {
			kind: 'error',
			message: 'Укажите имя персонажа перед регионом.',
		}
	}
	if ([...character].length > MAX_CHARACTER_LENGTH) {
		return {
			kind: 'error',
			message: `Имя персонажа не должно быть длиннее ${MAX_CHARACTER_LENGTH} символов.`,
		}
	}
	if (!regionToken) {
		return { kind: 'player', character, regions: ['RU'] }
	}
	if (!regionSet.has(regionToken)) {
		return {
			kind: 'error',
			message: `Неизвестный регион «${regionToken}». Доступны: RU, EU, NA, SEA, NEA.`,
		}
	}
	return { kind: 'player', character, regions: [regionToken as Region] }
}

export function profileUrl(
	region: Region,
	character: string,
	base = 'https://stalhub.dev'
): string {
	return `${base}/player/${region}/${encodeURIComponent(character)}`
}
