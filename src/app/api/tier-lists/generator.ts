import {
	TierItemKind,
	TierListKind,
	type TierRank,
} from 'generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { generateSlug } from '@/utils/slug'

const DATA_BASE = 'https://cdn.stalhub.dev/db'
const SC_DB_COMMIT_URL = 'https://api.github.com/repos/oarer/sc-db/commits/main'

interface Translation {
	type: string
	key: string
	args?: Record<string, string>
	lines?: Record<string, string>
	text?: string
}

type InfoElement = {
	type: string
	name?: Translation
	value?: number | number[]
	key?: Translation
	text?: Translation
}

type InfoBlock = {
	type: string
	title?: Translation
	target?: string
	elements?: InfoElement[]
	startDamage?: number
	endDamage?: number
	maxDistance?: number
	damageDecreaseStart?: number
	damageDecreaseEnd?: number
}

interface GameItem {
	id: string
	category: string
	color?: string
	name?: Translation
	infoBlocks: InfoBlock[]
}

type HitZone = 'body' | 'head' | 'limbs'

interface Scenario {
	name: string
	hitZone: HitZone
}

const AGGREGATE_SCENARIO: Scenario = {
	name: '400 сетов, в голову, сбп',
	hitZone: 'head',
}

const SETUP_COUNT = 400
const SETUP_HP_MIN = 400
const SETUP_HP_MAX = 800
const SETUP_VIT_MIN = 1.0
const SETUP_VIT_MAX = 1.3
const SETUP_VIT_START = 1.15
const SETUP_VIT_STEP = 0.005

interface Setup {
	bulletRes: number
	vitality: number
}

export function buildSetups(count = SETUP_COUNT): Setup[] {
	const setups: Setup[] = []
	const step = count > 1 ? (SETUP_HP_MAX - SETUP_HP_MIN) / (count - 1) : 0

	const minTh = Math.round(SETUP_VIT_MIN * 1000)
	const maxTh = Math.round(SETUP_VIT_MAX * 1000)
	const stepTh = Math.round(SETUP_VIT_STEP * 1000)
	let vitTh = Math.round(SETUP_VIT_START * 1000)
	let randomState = 0x9e3779b9
	const nextRandom = () => {
		randomState ^= randomState << 13
		randomState ^= randomState >>> 17
		randomState ^= randomState << 5
		return (randomState >>> 0) / 0x100000000
	}

	for (let i = 0; i < count; i++) {
		const bulletRes = SETUP_HP_MIN + step * i
		setups.push({ bulletRes, vitality: vitTh / 1000 })

		if (vitTh === minTh) {
			vitTh += stepTh
		} else if (vitTh === maxTh) {
			vitTh -= stepTh
		} else {
			vitTh += nextRandom() < 0.5 ? stepTh : -stepTh
		}
	}
	return setups
}

const KEEP_QUALITIES = new Set(['RANK_MASTER', 'RANK_LEGEND'])

function isKeepQuality(item: GameItem): boolean {
	return Boolean(item.color && KEEP_QUALITIES.has(item.color))
}

const CUSTOM_ROF_MAP: Record<
	string,
	{ rof: number; burstSize?: number; burstDelay?: number }
> = {
	y37kw: { rof: 1200, burstSize: 3, burstDelay: 150 },
	'96mn0': { rof: 1200, burstSize: 3, burstDelay: 150 },
	'3grwz': { rof: 1200, burstSize: 3, burstDelay: 150 },
}

const AMMO_TYPE_MAP: Record<string, string[]> = {
	'item.wpn.display_ammo_types.556mm': ['item.amm.556'],
	'item.wpn.display_ammo_types.545mm': ['item.amm.545'],
	'item.wpn.display_ammo_types.762mm': ['item.amm.762'],
	'item.wpn.display_ammo_types.9mm': ['item.amm.9'],
	'item.wpn.display_ammo_types.939mm': ['item.amm.939'],
	'item.wpn.display_ammo_types.127mm': ['item.amm.127'],
	'item.wpn.display_ammo_types.12gauge': ['item.amm.12'],
	'item.wpn.display_ammo_types.10gauge': ['item.amm.10'],
	'item.wpn.display_ammo_types.23mm': ['item.amm.23'],
}

function getNumericStat(item: GameItem, key: string): number {
	for (const block of item.infoBlocks) {
		if (block.type !== 'list') continue
		for (const el of block.elements ?? []) {
			if (
				el.type === 'numeric' &&
				el.name?.type === 'translation' &&
				el.name.key === key &&
				typeof el.value === 'number'
			) {
				return el.value
			}
		}
	}
	return 0
}

function getDamageBlock(item: GameItem): {
	startDamage: number
	endDamage: number
	maxDistance: number
	damageDecreaseStart: number
	damageDecreaseEnd: number
} | null {
	for (const block of item.infoBlocks) {
		if (block.type === 'damage') {
			return {
				startDamage: block.startDamage ?? 0,
				endDamage: block.endDamage ?? 0,
				maxDistance: block.maxDistance ?? 100,
				damageDecreaseStart: block.damageDecreaseStart ?? 0,
				damageDecreaseEnd: block.damageDecreaseEnd ?? 100,
			}
		}
	}
	return null
}

function getDamageModifiers(item: GameItem): { head: number; limbs: number } {
	for (const block of item.infoBlocks) {
		if (
			block.type === 'list' &&
			block.title?.type === 'translation' &&
			block.title.key === 'weapon.tooltip.weapon.info.damage_modifiers'
		) {
			let head = 1.4
			let limbs = 0.8
			for (const el of block.elements ?? []) {
				if (el.type !== 'text' || el.text?.type !== 'translation')
					continue
				const mod = Number.parseFloat(el.text.args?.modifier ?? '1')
				if (
					el.text.key === 'weapon.tooltip.weapon.head_damage_modifier'
				) {
					head = Number.isFinite(mod) ? mod : head
				}
				if (
					el.text.key ===
					'weapon.tooltip.weapon.limbs_damage_modifier'
				) {
					limbs = Number.isFinite(mod) ? mod : limbs
				}
			}
			return { head, limbs }
		}
	}
	return { head: 1.4, limbs: 0.8 }
}

function getAmmoType(item: GameItem): string {
	for (const block of item.infoBlocks) {
		if (block.type !== 'list') continue
		for (const el of block.elements ?? []) {
			if (
				el.type === 'key-value' &&
				el.key?.type === 'translation' &&
				el.key.key === 'weapon.tooltip.weapon.info.ammo_type'
			) {
				return el.value?.type === 'translation' &&
					typeof el.value !== 'number'
					? el.value.key
					: ''
			}
		}
	}
	return ''
}

function getAmmoPenetration(item: GameItem): number {
	return getNumericStat(item, 'weapon.tooltip.bullet.stat_name.piercing')
}

function getAmmoDamageBonus(item: GameItem): number {
	return getNumericStat(item, 'weapon.tooltip.bullet.stat_name.damage')
}

function getCompatibleAmmo(
	ammoItems: GameItem[],
	ammoTypeKey: string
): GameItem[] {
	const prefixes = AMMO_TYPE_MAP[ammoTypeKey]
	if (!prefixes) return []

	return ammoItems.filter((a) => {
		const nameKey = a.name?.type === 'translation' ? a.name.key : ''
		if (!nameKey.startsWith('item.amm.')) return false

		const normalized = nameKey.replace(/\.name$/, '')
		const itemCaliber = normalized.split('.')[2]?.match(/^\d+/)?.[0]
		if (!itemCaliber) return false

		return prefixes.some((p) => p === `item.amm.${itemCaliber}`)
	})
}

function getDamageAt(
	block: NonNullable<ReturnType<typeof getDamageBlock>>,
	dist: number
): number {
	if (dist <= block.damageDecreaseStart) return block.startDamage
	if (dist >= block.damageDecreaseEnd) return block.endDamage
	const range = block.damageDecreaseEnd - block.damageDecreaseStart
	if (range <= 0) return block.endDamage
	const t = (dist - block.damageDecreaseStart) / range
	return block.startDamage + t * (block.endDamage - block.startDamage)
}

const SHARPEN_INDEX = 15

function getDamageVariant(item: GameItem, variantIndex: number): number {
	let values: number[] = []
	for (const block of item.infoBlocks) {
		if (block.type !== 'list') continue
		for (const el of block.elements ?? []) {
			if (
				el.type === 'numericVariants' &&
				el.name?.type === 'translation' &&
				el.name.key === 'core.tooltip.stat_name.damage_type.direct'
			) {
				values = el.value ?? []
				break
			}
		}
		if (values.length) break
	}
	if (!values.length) return 0
	const idx = Math.min(Math.max(variantIndex, 0), values.length - 1)
	return values[idx] ?? 0
}

function getShotsToKill(hp: number, dmg: number): number {
	if (hp <= 0 || dmg <= 0) return 0
	return Math.ceil(hp / dmg)
}

function getDmgPerShot(
	weapon: GameItem,
	ammo: GameItem | null,
	hitZone: HitZone,
	dist: number,
	variantIndex = SHARPEN_INDEX
): number {
	const block = getDamageBlock(weapon)
	if (!block) return 0

	const variantBase = getDamageVariant(weapon, variantIndex)
	const baseRatio =
		block.startDamage > 0
			? (variantBase > 0 ? variantBase : block.startDamage) /
				block.startDamage
			: 1

	let dmg = getDamageAt(block, dist) * baseRatio

	const ammoDmgBonus = ammo ? getAmmoDamageBonus(ammo) : 0
	dmg *= 1 + ammoDmgBonus / 100

	const mods = getDamageModifiers(weapon)
	const zoneMult =
		hitZone === 'head' ? mods.head : hitZone === 'limbs' ? mods.limbs : 1
	dmg *= zoneMult

	return Math.max(0, dmg)
}

function getReloadTime(weapon: GameItem, shots: number): number {
	if (shots <= 0) return 0
	const mag = getNumericStat(weapon, 'weapon.tooltip.weapon.info.clip_size')
	if (mag <= 0 || shots <= mag) return 0
	const reloads = Math.floor((shots - 1) / mag)
	const reloadTime = getNumericStat(
		weapon,
		'weapon.tooltip.magazine.info.reload_time'
	)
	return reloads * reloadTime
}

function calcBurstTTK(
	shots: number,
	rof: number,
	burstSize: number,
	burstDelay: number
): number {
	const bulletDelayMs = 60000 / rof
	const bursts = Math.ceil(shots / burstSize)
	const queueDelay = (bursts - 1) * burstDelay
	const inBurstDelay = (shots - bursts) * bulletDelayMs
	return (queueDelay + inBurstDelay) / 1000
}

function ttkAfterShots(weapon: GameItem, rof: number, shots: number): number {
	if (shots <= 0) return Number.MAX_SAFE_INTEGER
	const custom = CUSTOM_ROF_MAP[weapon.id]
	let ttk
	if (custom && custom.burstSize) {
		ttk =
			calcBurstTTK(
				shots,
				custom.rof,
				custom.burstSize,
				custom.burstDelay ?? 150
			) + getReloadTime(weapon, shots)
	} else {
		ttk = (shots - 1) * (60 / rof) + getReloadTime(weapon, shots)
	}
	return Number.isFinite(ttk) ? ttk : Number.MAX_SAFE_INTEGER
}

function averageWeaponTTK(
	weapon: GameItem,
	ammo: GameItem | null,
	setups: Setup[],
	hitZone: HitZone,
	sharpen = SHARPEN_INDEX
): number {
	const custom = CUSTOM_ROF_MAP[weapon.id]
	const rof =
		custom?.rof ??
		getNumericStat(weapon, 'weapon.tooltip.weapon.info.rate_of_fire')
	if (rof <= 0) return Number.MAX_SAFE_INTEGER

	const penetration = ammo ? getAmmoPenetration(ammo) : 0
	const dmg = getDmgPerShot(weapon, ammo, hitZone, 0, sharpen)
	if (dmg <= 0) return Number.MAX_SAFE_INTEGER

	let total = 0
	for (const { bulletRes, vitality } of setups) {
		const armor = bulletRes / vitality - 100
		const effectiveHp = (100 + armor * (1 - penetration / 100)) * vitality
		const shots = getShotsToKill(effectiveHp, dmg)
		total += ttkAfterShots(weapon, rof, shots)
	}

	return setups.length > 0 ? total / setups.length : Number.MAX_SAFE_INTEGER
}

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
	return res.json() as Promise<T>
}

async function getSourceCommit(): Promise<string> {
	const data = await fetchJson<{ sha: string }>(SC_DB_COMMIT_URL)
	return data.sha
}

const RANK_ORDER: TierRank[] = ['S', 'A', 'B', 'C', 'D', 'E']
const TTK_DISPLAY_PRECISION = 2

function displayedTtk(ttk: number): number {
	return Number(ttk.toFixed(TTK_DISPLAY_PRECISION))
}

type ScoredWeapon = {
	weapon: GameItem
	ttk: number
	ammoName: string | null
}

export function shouldGenerateForCommit(
	previousCommit: string | null,
	currentCommit: string
): boolean {
	return previousCommit !== currentCommit
}

export function rankFromTtk(
	ttk: number,
	minTtk: number,
	maxTtk: number
): TierRank {
	const span = maxTtk - minTtk
	if (span <= 0) return 'S'
	if (ttk >= maxTtk) return 'E'
	const fraction = (ttk - minTtk) / span
	const index = Math.min(
		RANK_ORDER.length - 1,
		Math.max(0, Math.floor(fraction * RANK_ORDER.length))
	)
	return RANK_ORDER[index]
}

export function buildRankedEntries(
	scored: ScoredWeapon[]
): Array<{ item_id: string; rank: TierRank; position: number }> {
	const sorted = [...scored].sort(
		(a, b) => a.ttk - b.ttk || a.weapon.id.localeCompare(b.weapon.id)
	)
	if (sorted.length === 0) return []

	const groups: Array<{
		start: number
		end: number
		value: number
		weight: number
	}> = []
	for (let start = 0; start < sorted.length; ) {
		const value = displayedTtk(sorted[start].ttk)
		let end = start + 1
		while (end < sorted.length && displayedTtk(sorted[end].ttk) === value)
			end++
		groups.push({ start, end, value, weight: end - start })
		start = end
	}

	const tierCount = Math.min(RANK_ORDER.length, groups.length)
	const boundaries: number[] = []
	let previousBoundary = 0
	for (let tier = 1; tier < tierCount; tier++) {
		const target = Math.round((tier * sorted.length) / tierCount)
		let best = previousBoundary + 1
		let bestDistance = Number.POSITIVE_INFINITY
		for (const group of groups) {
			if (group.start <= previousBoundary || group.start >= sorted.length)
				continue
			const distance = Math.abs(group.start - target)
			if (distance < bestDistance) {
				best = group.start
				bestDistance = distance
			}
		}
		boundaries.push(best)
		previousBoundary = best
	}

	const entries: Array<{
		item_id: string
		rank: TierRank
		position: number
	}> = []

	for (let i = 0; i < sorted.length; i++) {
		const boundaryIndex = boundaries.findIndex((boundary) => i < boundary)
		const rankIndex = boundaryIndex === -1 ? tierCount - 1 : boundaryIndex
		entries.push({
			item_id: sorted[i].weapon.id,
			rank: RANK_ORDER[rankIndex],
			position: i,
		})
	}

	return entries
}

function itemName(item: GameItem): string {
	return item.name?.lines?.ru ?? item.name?.key ?? item.id
}

interface WeaponCategory {
	key: string
	label: string
	categories: string[]
}

const WEAPON_CATEGORIES: WeaponCategory[] = [
	{
		key: 'assault_rifle',
		label: 'Штурмовые винтовки',
		categories: ['weapon/assault_rifle'],
	},
	{
		key: 'sniper_rifle',
		label: 'Снайперские винтовки',
		categories: ['weapon/sniper_rifle'],
	},
	{
		key: 'shotgun_rifle',
		label: 'Дробовики',
		categories: ['weapon/shotgun_rifle'],
	},
	{
		key: 'submachine_gun',
		label: 'Пистолеты-пулемёты',
		categories: ['weapon/submachine_gun'],
	},
	{
		key: 'machine_gun',
		label: 'Пулемёты',
		categories: ['weapon/machine_gun'],
	},
	{ key: 'pistol', label: 'Пистолеты', categories: ['weapon/pistol'] },
	{ key: 'heavy', label: 'Тяжёлое оружие', categories: ['weapon/heavy'] },
]

const GENERAL_CATEGORY: WeaponCategory = {
	key: 'general',
	label: 'Общая',
	categories: [
		'weapon/assault_rifle',
		'weapon/sniper_rifle',
		'weapon/submachine_gun',
		'weapon/machine_gun',
	],
}

const MELEE_CATEGORIES = ['weapon/melee']

function scoreWeapons(
	weapons: GameItem[],
	ammoItems: GameItem[],
	setups: Setup[],
	hitZone: HitZone
): Array<{ weapon: GameItem; ttk: number; ammoName: string | null }> {
	return weapons.map((weapon) => {
		const ammoTypeKey = getAmmoType(weapon)
		const compatibleAmmo = getCompatibleAmmo(ammoItems, ammoTypeKey)
		const bestAmmo =
			compatibleAmmo.length > 0
				? compatibleAmmo.reduce((best, a) => {
						const aPen = getAmmoPenetration(a)
						const bPen = getAmmoPenetration(best)
						return aPen > bPen ? a : best
					})
				: null

		const ttk = averageWeaponTTK(weapon, bestAmmo, setups, hitZone)

		return { weapon, ttk, ammoName: bestAmmo ? itemName(bestAmmo) : null }
	})
}

async function upsertSystemTierList(
	category: WeaponCategory,
	scored: Array<{ weapon: GameItem; ttk: number; ammoName: string | null }>
): Promise<{ changed: boolean; created: boolean }> {
	const validWeapons = scored
		.filter((s) => s.ttk < Number.MAX_SAFE_INTEGER)
		.sort((a, b) => a.ttk - b.ttk || a.weapon.id.localeCompare(b.weapon.id))

	if (validWeapons.length === 0) return { changed: false, created: false }

	const scenarioName = AGGREGATE_SCENARIO.name
	const title = `${category.label} • ${scenarioName}`
	const slug = generateSlug(title)

	const entries = buildRankedEntries(validWeapons)
	const entriesWithTtk = entries.map((entry) => ({
		...entry,
		ttk: validWeapons[entry.position].ttk,
	}))

	const live = await prisma.tierList.findMany({
		where: {
			category: category.key,
			kind: TierListKind.SYSTEM,
			removed_at: null,
		},
		include: { entries: true },
	})

	const freshOrLatest =
		live.find((l) => l.is_current) ??
		[...live].sort(
			(a, b) =>
				(b.generated_at?.getTime() ?? 0) -
				(a.generated_at?.getTime() ?? 0)
		)[0]

	if (freshOrLatest?.source_commit === sourceCommit) {
		return { changed: false, created: false }
	}

	const previous = live.find((l) => l.id !== freshOrLatest?.id)
	if (previous) {
		await prisma.tierListHistory.create({
			data: {
				external_id: previous.external_id,
				title: previous.title,
				item_kind: previous.item_kind,
				category: previous.category,
				scenario: previous.scenario,
				generated_at: previous.generated_at ?? previous.updated_at,
				removed_at: new Date(),
				entries: previous.entries.map((e) => ({
					item_id: e.item_id,
					rank: e.rank,
					position: e.position,
				})),
			},
		})
		await prisma.tierList.delete({ where: { id: previous.id } })
	}

	const now = new Date()

	if (freshOrLatest) {
		await prisma.tierList.update({
			where: { id: freshOrLatest.id },
			data: { external_id: `${slug}-prev`, is_current: false },
		})
	}

	await prisma.tierList.create({
		data: {
			external_id: slug,
			title,
			kind: TierListKind.SYSTEM,
			item_kind: TierItemKind.WEAPON,
			is_public: true,
			scenario: scenarioName,
			category: category.key,
			generated_at: now,
			source_commit: sourceCommit,
			is_current: true,
			entries: { create: entriesWithTtk },
		},
	})

	return { changed: true, created: !freshOrLatest }
}

export async function generateSystemTierLists() {
	const sourceCommit = await getSourceCommit()
	const [weaponsDict, ammoDict] = await Promise.all([
		fetchJson<Record<string, GameItem>>(
			`${DATA_BASE}/listing/weapons.json`
		),
		fetchJson<Record<string, GameItem>>(`${DATA_BASE}/listing/ammo.json`),
	])

	const weapons = Object.values(weaponsDict)
	const ammoItems = Object.values(ammoDict)

	const setups = buildSetups()
	const existingSystemList = await prisma.tierList.findFirst({
		where: { kind: TierListKind.SYSTEM, source_commit: { not: null } },
		orderBy: { generated_at: 'desc' },
	})
	if (existingSystemList?.source_commit === sourceCommit) return 0

	const weaponsWithDamage = weapons.filter(
		(w) =>
			getDamageBlock(w) !== null &&
			!MELEE_CATEGORIES.includes(w.category) &&
			isKeepQuality(w)
	)

	const generationGroups: WeaponCategory[] = [
		...WEAPON_CATEGORIES,
		GENERAL_CATEGORY,
	]

	let generated = 0
	for (const group of generationGroups) {
		const groupWeapons = weaponsWithDamage.filter((w) =>
			group.categories.includes(w.category)
		)
		if (groupWeapons.length === 0) continue

		const scored = scoreWeapons(
			groupWeapons,
			ammoItems,
			setups,
			AGGREGATE_SCENARIO.hitZone
		)
		const result = await upsertSystemTierList(group, scored)
		if (result.created) generated++
	}

	return generated
}
