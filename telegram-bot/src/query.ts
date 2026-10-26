export const REGIONS = ['RU', 'EU', 'NA', 'SEA', 'NEA'] as const
export type Region = (typeof REGIONS)[number]

export type ParsedQuery =
	| { kind: 'empty' }
	| { kind: 'error'; message: string }
	| { kind: 'player'; character: string; regions: Region[] }

const regionSet = new Set<string>(REGIONS)
const MAX_CHARACTER_LENGTH = 64

export function parseInlineQuery(input: string): ParsedQuery {
	const tokens = input.trim().split(/\s+/).filter(Boolean)
	if (tokens[0]?.startsWith('@')) tokens.shift()
	if (tokens.length === 0) return { kind: 'empty' }
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
		return { kind: 'player', character, regions: [...REGIONS] }
	}
	if (!regionSet.has(regionToken)) {
		return {
			kind: 'error',
			message: `Неизвестный регион «${regionToken}». Доступны: RU, EU, NA, SEA, NEA.`,
		}
	}
	return { kind: 'player', character, regions: [regionToken as Region] }
}

export function profileUrl(region: Region, character: string): string {
	return `https://stalhub.dev/player/${region}/${encodeURIComponent(character)}`
}
