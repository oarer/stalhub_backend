import type { ItemCategory, ItemData, StatChange } from '../types'
import { getArmorComparisonList } from './armor'
import { getArtefactComparisonList } from './artefact'
import { getAttachmentComparisonList } from './attachment'
import { getBagComparisonList } from './bag'
import { getBoostComparisonList } from './boost'
import { getBulletComparisonList } from './bullet'
import { getGrenadeComparisonList } from './grenade'
import { getWeaponComparisonList } from './weapon'

export type ComparisonFn = (
	oldData: ItemData,
	newData: ItemData,
	lang?: string
) => StatChange[]

export function getComparisonForCategory(
	category: ItemCategory
): ComparisonFn | null {
	switch (category) {
		case 'armor':
			return getArmorComparisonList
		case 'artefact':
			return getArtefactComparisonList
		case 'weapon':
			return getWeaponComparisonList
		case 'attachment':
			return getAttachmentComparisonList
		case 'bag':
			return getBagComparisonList
		case 'boost':
			return getBoostComparisonList
		case 'bullet':
			return getBulletComparisonList
		case 'grenade':
			return getGrenadeComparisonList
		default:
			return null
	}
}
