import type {
	UnoExensValue,
	UnoProfileCustomization,
	UnoProfileStickerItem,
	UnoRawPlayer,
	UnoStickerFlipbook,
} from '@/types/uno.type'
import { isSafeUrl } from '@/utils/xss-guard'
import { compactPlayerGear } from './compact'
import { parsePlayerGear } from './gear'
import { getUnoItemLookup } from './item-db'
import { normalizeAssetUrl } from './render'
import { unoService } from './service'

const PROFILE_ASSET_OPTIONS = {
	baseUrl: 'https://static.stalhub.dev',
	pathPrefix: 'sc',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateUnoPlayer(value: unknown): UnoRawPlayer {
	if (!isRecord(value)) throw new Error('Invalid UNO player response')
	return value as UnoRawPlayer
}

function normalizeExens(value: unknown): UnoExensValue | undefined {
	if (value === undefined) return undefined
	if (value === null) return null
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value
	}
	if (Array.isArray(value)) {
		const normalized = value.map((entry) => normalizeExens(entry))
		return normalized.some((entry) => entry === undefined)
			? undefined
			: (normalized as UnoExensValue[])
	}
	if (!isRecord(value)) return undefined

	const normalized: Record<string, UnoExensValue> = {}
	for (const [key, entry] of Object.entries(value)) {
		if (key === '__proto__' || key === 'constructor' || key === 'prototype')
			continue
		const normalizedEntry = normalizeExens(entry)
		if (normalizedEntry === undefined) return undefined
		normalized[key] = normalizedEntry
	}
	return normalized
}

function normalizeSocialLinks(value: unknown): Record<string, string> | null {
	if (!isRecord(value)) return null

	const links: Record<string, string> = {}
	for (const [key, rawValue] of Object.entries(value)) {
		if (
			!key ||
			key.length > 64 ||
			key === '__proto__' ||
			key === 'constructor' ||
			key === 'prototype' ||
			typeof rawValue !== 'string'
		)
			continue

		const link = rawValue.trim()
		if (!link || link.length > 2048 || !isSafeUrl(link)) continue
		links[key] = link
	}

	return Object.keys(links).length > 0 ? links : null
}

const ASSET_KEYS = ['url', 'path', 'asset', 'src', 'value', 'image'] as const

function getAssetValue(value: unknown): string | null {
	if (typeof value === 'string') return value
	if (!isRecord(value)) return null

	for (const key of ASSET_KEYS) {
		if (typeof value[key] === 'string') return value[key]
	}

	const definition = value.definition
	if (isRecord(definition)) {
		for (const key of ASSET_KEYS) {
			if (typeof definition[key] === 'string') return definition[key]
		}
	}

	return null
}

function normalizeProfileAsset(value: unknown): string | null {
	const asset = getAssetValue(value)
	if (!asset) return null

	const normalized = normalizeAssetUrl(asset, PROFILE_ASSET_OPTIONS)
	if (!normalized) return null

	return normalized.replace(/\.dds$/i, '.png')
}

function toFiniteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseStickerParameters(value: unknown): {
	top: number | null
	left: number | null
	width: number | null
	rotate: number | null
} {
	const parameters = isRecord(value) ? value.parameters : undefined
	if (!Array.isArray(parameters)) {
		return { top: null, left: null, width: null, rotate: null }
	}

	const px = toFiniteNumber(parameters[0])
	const py = toFiniteNumber(parameters[1])
	const p2 = toFiniteNumber(parameters[2])
	const p5 = toFiniteNumber(parameters[5])
	const rotate = toFiniteNumber(parameters[4])

	// UNO stores position as % offset from the card centre (-100..+100 each axis).
	// Convert to CSS %: 50 + param / 2  →  -100 → 0%, 0 → 50%, +100 → 100%
	//
	// Size: parameters[5] is the actual display size (% of card height) when non-zero.
	// parameters[2] carries the mirror flag (negative = flip horizontally) and acts as
	// fallback size when parameters[5] is absent or zero.
	const isMirrored = p2 != null && p2 < 0
	const absSize = p5 != null && p5 > 0 ? p5 : p2 != null ? Math.abs(p2) : null
	const width = absSize != null ? (isMirrored ? -absSize : absSize) : null

	return {
		left: px != null ? 50 + px / 2 : null,
		top: py != null ? 50 + py / 2 : null,
		width,
		rotate,
	}
}

function normalizeFlipbook(value: unknown): UnoStickerFlipbook | null {
	if (!isRecord(value)) return null
	const def = value.definition
	if (!isRecord(def)) return null
	const fb = def.flipbook
	if (!isRecord(fb)) return null

	const frames =
		typeof fb.frames === 'number' && fb.frames > 1 ? fb.frames : null
	const rows = typeof fb.rows === 'number' ? fb.rows : null
	const columns = typeof fb.columns === 'number' ? fb.columns : null
	const fps = typeof fb.fps === 'number' ? fb.fps : null

	if (!frames || !rows || !columns) return null

	return {
		frames,
		rows,
		columns,
		fps: fps ?? 10,
		frameBlending:
			typeof fb.frame_blending === 'boolean' ? fb.frame_blending : false,
		pingPong: typeof fb.ping_pong === 'boolean' ? fb.ping_pong : false,
	}
}

function normalizeSticker(value: unknown): UnoProfileStickerItem | null {
	const src = normalizeProfileAsset(value)
	if (!src) return null

	const definition = isRecord(value) ? value.definition : undefined
	const dimensions = isRecord(definition) ? definition : undefined

	return {
		src,
		...parseStickerParameters(value),
		image_width: toFiniteNumber(dimensions?.image_width),
		image_height: toFiniteNumber(dimensions?.image_height),
		slot: isRecord(value) ? toFiniteNumber(value.slot) : null,
		flipbook: normalizeFlipbook(value),
	}
}

function normalizeStickers(value: unknown): UnoProfileStickerItem[] | null {
	let entries: unknown[]
	if (Array.isArray(value)) entries = value
	else if (isRecord(value)) entries = Object.values(value)
	else return null

	const stickers = entries
		.map((sticker) => normalizeSticker(sticker))
		.filter((sticker): sticker is UnoProfileStickerItem => sticker !== null)
	return stickers.length > 0 ? stickers : null
}

function customizationSources(player: UnoRawPlayer): Record<string, unknown>[] {
	const nested = [player.customization, player.appearance, player.profile]
		.flatMap((value) => {
			if (!isRecord(value)) return []
			return [value, value.customization, value.appearance]
		})
		.filter(isRecord)

	return [...nested, player]
}

function firstCustomizationValue(
	sources: Record<string, unknown>[],
	keys: string[]
): unknown {
	for (const source of sources) {
		for (const key of keys) {
			const value = source[key]
			if (value !== undefined && value !== null) return value
		}
	}
	return undefined
}

export function normalizeCustomization(
	player: UnoRawPlayer
): UnoProfileCustomization {
	const sources = customizationSources(player)
	return {
		background: normalizeProfileAsset(
			firstCustomizationValue(sources, [
				'background',
				'background_url',
				'backgroundUrl',
				'profile_background',
				'profileBackground',
			])
		),
		pattern: normalizeProfileAsset(
			firstCustomizationValue(sources, [
				'pattern',
				'pattern_url',
				'patternUrl',
				'profile_pattern',
				'profilePattern',
			])
		),
		frame: normalizeProfileAsset(
			firstCustomizationValue(sources, [
				'frame',
				'frame_url',
				'frameUrl',
				'profile_frame',
				'profileFrame',
			])
		),
		stickers: normalizeStickers(
			firstCustomizationValue(sources, [
				'stickers',
				'sticker_urls',
				'stickerUrls',
				'profile_stickers',
				'profileStickers',
			])
		),
	}
}

export async function getUnoPlayerProfile(
	nickname: string,
	signal?: AbortSignal
) {
	const [rawPlayer, lookup] = await Promise.all([
		unoService.request<unknown>(
			`/players/${encodeURIComponent(nickname)}`,
			{},
			{ signal }
		),
		getUnoItemLookup(),
	])
	const player = validateUnoPlayer(rawPlayer)
	const gear = compactPlayerGear(parsePlayerGear(player, lookup))

	return {
		gear,
		strings: gear.strings,
		exens: normalizeExens(player.exens) ?? null,
		social_links: normalizeSocialLinks(player.social_links),
		customization: normalizeCustomization(player),
	}
}
