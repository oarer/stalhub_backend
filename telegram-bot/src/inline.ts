import { BackendError, fetchProfile, type ProfileCache } from './backend'
import type { BotConfig } from './config'
import { type InlineArticle, messageArticle, profileArticle } from './format'
import { type ParsedQuery, parseInlineQuery, type Region } from './query'
import type { PlayerProfile } from './stats'

export type InlineLookup = (
	region: Region,
	character: string
) => Promise<PlayerProfile>

export function emptyHint(): InlineArticle {
	const message =
		'Введите имя персонажа, например: @stalhubbot Nick или @stalhubbot Nick RU'
	return messageArticle(message, 'help', {
		title: 'Поиск игрока',
		description: message,
	})
}

function shortHash(value: string): string {
	let hash = 2_166_136_261
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0
		hash = Math.imul(hash, 16_777_619) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

export function errorHint(message: string): InlineArticle {
	return messageArticle(message, `error:${shortHash(message)}`, {
		title: 'Ошибка поиска',
		description: message,
	})
}

export async function buildInlineResults(
	input: string,
	lookup: InlineLookup,
	options: { webAppUrl?: string } = {}
): Promise<InlineArticle[]> {
	const parsed = parseInlineQuery(input)
	if (parsed.kind === 'empty') return [emptyHint()]
	if (parsed.kind === 'error') return [errorHint(parsed.message)]

	const lookupResult = await lookupProfiles(parsed, lookup)
	if (lookupResult.successes.length > 0) {
		return lookupResult.successes.map(({ profile, region }) =>
			profileArticle(
				profile,
				region,
				`${region}:${profile.username}`,
				options
			)
		)
	}
	if (lookupResult.errors.every(({ error }) => isNotFound(error))) {
		return [
			errorHint(
				`Персонаж «${parsed.character}» не найден в выбранных регионах.`
			),
		]
	}
	return [errorHint('Не удалось получить данные. Попробуйте позже.')]
}

type LookupResult = {
	successes: Array<{ region: Region; profile: PlayerProfile }>
	errors: Array<{ region: Region; error: unknown }>
}

async function lookupProfiles(
	parsed: Extract<ParsedQuery, { kind: 'player' }>,
	lookup: InlineLookup
): Promise<LookupResult> {
	const settled = await Promise.allSettled(
		parsed.regions.map(async (region) => ({
			region,
			profile: await lookup(region, parsed.character),
		}))
	)
	const result: LookupResult = { successes: [], errors: [] }
	for (const [index, item] of settled.entries()) {
		if (item.status === 'fulfilled') result.successes.push(item.value)
		else
			result.errors.push({
				region: parsed.regions[index],
				error: item.reason,
			})
	}
	return result
}

export function createLookup(
	config: BotConfig,
	cache: ProfileCache,
	fetchImpl: typeof fetch = fetch
): InlineLookup {
	return async (region, character) => {
		const cached = cache.get(region, character)
		if (cached) return cached
		const profile = await fetchProfile(config, region, character, fetchImpl)
		cache.set(region, character, profile)
		return profile
	}
}

export function isNotFound(error: unknown): boolean {
	return error instanceof BackendError && error.status === 404
}
