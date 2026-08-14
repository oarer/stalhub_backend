import type { AttachmentItem, WeaponEntry } from '@/types/attachments.type'

const ATTACHMENTS_URL =
	'https://github.com/oarer/sc-db/raw/refs/heads/main/merged/listing/attachments.json'
const WEAPONS_URL =
	'https://github.com/oarer/sc-db/raw/refs/heads/main/merged/listing/weapons.json'

const SUITABLE_TARGETS_KEY = 'weapon.lore.attachment.all_suitable_targets'

const fetchJson = async <T>(url: string): Promise<T> => {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Failed to fetch ${url}`)
	return res.json()
}

let inMemoryAttachments: Record<string, AttachmentItem> | null = null
let inMemoryWeapons: Record<string, WeaponEntry> | null = null
let compatibleIndex: Map<string, string[]> | null = null

export const loadAttachments = async () => {
	if (!inMemoryAttachments) {
		inMemoryAttachments =
			await fetchJson<Record<string, AttachmentItem>>(ATTACHMENTS_URL)
		console.log(
			'[Attachments] Loaded',
			Object.keys(inMemoryAttachments).length,
			'attachments'
		)
	}
	return inMemoryAttachments
}

export const loadWeapons = async () => {
	if (!inMemoryWeapons) {
		const weapons =
			await fetchJson<Record<string, WeaponEntry>>(WEAPONS_URL)
		inMemoryWeapons = {}
		for (const [id, weapon] of Object.entries(weapons)) {
			inMemoryWeapons[id] = {
				id,
				category: weapon.category,
				name: weapon.name,
				color: weapon.color,
			}
		}
		console.log(
			'[Attachments:Weapons] Loaded',
			Object.keys(inMemoryWeapons).length,
			'weapons'
		)
	}
	return inMemoryWeapons
}

const buildCompatibleIndex = (
	attachments: Record<string, AttachmentItem>
): Map<string, string[]> => {
	const index = new Map<string, string[]>()

	for (const attachment of Object.values(attachments)) {
		const targets = new Set<string>()

		for (const block of attachment.infoBlocks) {
			if (block.type !== 'list') continue

			if (
				block.title?.type !== 'translation' ||
				block.title.key !== SUITABLE_TARGETS_KEY
			) {
				continue
			}

			for (const el of block.elements ?? []) {
				if (el.type !== 'item') continue

				const key = el.name?.type === 'translation' ? el.name.key : null
				if (key) targets.add(key)
			}
		}

		for (const target of targets) {
			const list = index.get(target) ?? []
			list.push(attachment.id)
			index.set(target, list)
		}
	}

	return index
}

export const loadCompatibleIndex = async () => {
	if (!compatibleIndex) {
		const attachments = await loadAttachments()
		compatibleIndex = buildCompatibleIndex(attachments)
		console.log(
			'[Attachments:Index] Built',
			compatibleIndex.size,
			'weapon targets'
		)
	}
	return compatibleIndex
}

export const resetCache = () => {
	inMemoryAttachments = null
	inMemoryWeapons = null
	compatibleIndex = null
}

export const getWeaponAttachments = (
	weaponId: string
): { weapon: WeaponEntry | null; attachments: AttachmentItem[] } => {
	if (!inMemoryWeapons || !inMemoryAttachments || !compatibleIndex) {
		return { weapon: null, attachments: [] }
	}

	const weapon = inMemoryWeapons[weaponId]
	if (!weapon) return { weapon: null, attachments: [] }

	const key = weapon.name.type === 'translation' ? weapon.name.key : null
	if (!key) return { weapon, attachments: [] }

	const ids = compatibleIndex.get(key) ?? []

	const attachments = ids
		.map((id) => inMemoryAttachments?.[id])
		.filter((a): a is AttachmentItem => a !== undefined)

	return { weapon, attachments }
}
