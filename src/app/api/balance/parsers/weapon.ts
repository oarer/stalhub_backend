import type { ItemData, StatChange } from '../types'
import {
	buildStatChange,
	formatValue,
	getItemName,
	getNumericValue,
	getTextParamValue,
	getTextValue,
} from './helpers'

export function parseWeapon(
	data: ItemData,
	lang = 'ru'
): Record<string, string | number | null> {
	const infoBlocks = data.infoBlocks
	return {
		Название: getItemName(data, lang) ?? null,
		Ранг: getTextValue(infoBlocks, 'core.tooltip.info.rank', lang) ?? null,
		Категория:
			getTextValue(infoBlocks, 'core.tooltip.info.category', lang) ??
			null,
		'Скорость передвижения':
			getNumericValue(
				infoBlocks,
				'stalker.artefact_properties.factor.speed_modifier'
			) ?? null,
		Вес: getNumericValue(infoBlocks, 'core.tooltip.info.weight') ?? null,
		Патрон:
			getTextValue(
				infoBlocks,
				'weapon.tooltip.weapon.info.ammo_type',
				lang
			) ?? null,
		Урон:
			getNumericValue(
				infoBlocks,
				'core.tooltip.stat_name.damage_type.direct'
			) ?? null,
		Скорострельность:
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.weapon.info.rate_of_fire'
			) ?? null,
		'Размер магазина':
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.weapon.info.clip_size'
			) ?? null,
		Перезарядка:
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.magazine.info.reload_time'
			) ?? null,
		'Тактическая перезарядка':
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.magazine.info.reload_time_tactical'
			) ?? null,
		'Макс. дистанция':
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.weapon.info.distance'
			) ?? null,
		Разброс:
			getNumericValue(infoBlocks, 'weapon.tooltip.weapon.info.spread') ??
			null,
		'Разброс от бедра':
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.weapon.info.hip_spread'
			) ?? null,
		'Вертикальная отдача':
			getNumericValue(infoBlocks, 'weapon.tooltip.weapon.info.recoil') ??
			null,
		'Горизонтальная отдача':
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.weapon.info.horizontal_recoil'
			) ?? null,
		Доставание:
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.weapon.info.draw_time'
			) ?? null,
		Прицеливание:
			getNumericValue(
				infoBlocks,
				'weapon.tooltip.weapon.info.aim_switch'
			) ?? null,
		'Эргономика оружия':
			getNumericValue(infoBlocks, 'weapon.stat_factor.reload_modifier') ??
			null,
		Перегрев: getTextParamValue(infoBlocks, 'overheat_after') ?? null,
		'Множитель в голову':
			getTextParamValue(infoBlocks, 'head_damage_modifier') ?? null,
		'Множитель по конечностям':
			getTextParamValue(infoBlocks, 'limbs_damage_modifier') ?? null,
	}
}

export function getWeaponComparisonList(
	oldData: ItemData,
	newData: ItemData
): StatChange[] {
	const lines: StatChange[] = []
	const oldStats = parseWeapon(oldData)
	const newStats = parseWeapon(newData)

	for (const key of Object.keys(oldStats)) {
		const vOld = oldStats[key]
		const vNew = newStats[key]

		if (formatValue(vOld) !== formatValue(vNew)) {
			lines.push(buildStatChange(key, vOld, vNew))
		}
	}

	return lines
}
