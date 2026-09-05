import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { balanceConfig } from './config'

const ARMOR_DEFAULT_REGISTRY: Record<string, string> = {
	'core.tooltip.info.weight': 'Вес',
	'stalker.artefact_properties.factor.max_weight_bonus': 'Переносимый вес',
	'stalker.artefact_properties.factor.frost_protection': 'Защита от холода',
	'stalker.artefact_properties.factor.bullet_dmg_factor': 'Пулестойкость',
	'stalker.artefact_properties.factor.tear_dmg_factor': 'Защита от разрыва',
	'stalker.artefact_properties.factor.explosion_dmg_factor':
		'Защита от взрыва',
	'stalker.artefact_properties.factor.electra_dmg_factor': 'Электрозащита',
	'stalker.artefact_properties.factor.burn_dmg_factor': 'Защита от огня',
	'stalker.artefact_properties.factor.chemical_burn_dmg_factor': 'Химзащита',
	'stalker.artefact_properties.factor.radiation_protection':
		'Защита от радиации',
	'stalker.artefact_properties.factor.thermal_protection':
		'Защита от температуры',
	'stalker.artefact_properties.factor.biological_protection':
		'Защита от биозаражения',
	'stalker.artefact_properties.factor.psycho_protection':
		'Защита от пси-излучения',
	'stalker.artefact_properties.factor.bleeding_protection':
		'Защита от кровотечения',
}

const BAGS_DEFAULT_REGISTRY: Record<string, string> = {
	'core.tooltip.info.weight': 'Вес',
	'stalker.tooltip.backpack.stat_name.inner_protection': 'Внутренняя защита',
	'stalker.tooltip.backpack.stat_name.effectiveness': 'Эффективность',
	'stalker.tooltip.backpack.info.size': 'Вместимость',
}

const BOOSTS_DEFAULT_REGISTRY: Record<string, string> = {
	'core.tooltip.info.weight': 'Вес',
	'stalker.tooltip.medicine.info.priority': 'Приоритет эффекта',
	'stalker.tooltip.medicine.info.duration': 'Время действия',
	'stalker.tooltip.medicine.info.toxicity': 'Отравление',
}

const ATTACHMENTS_DEFAULT_REGISTRY: Record<string, string> = {
	'core.tooltip.info.weight': 'Вес',
}

const BULLETS_DEFAULT_REGISTRY: Record<string, string> = {
	'core.tooltip.info.weight': 'Вес',
}

const GRENADES_DEFAULT_REGISTRY: Record<string, string> = {
	'core.tooltip.info.weight': 'Вес',
	'weapon.grenade.frag.stats.info.explosion_strength': 'Урон в центре',
	'weapon.grenade.frag.stats.info.explosion_strength_min': 'Минимальный урон',
	'weapon.grenade.frag.stats.info.stopping_power': 'Останавливающее действие',
	'weapon.grenade.frag.stats.info.lifetime': 'Время до взрыва',
	'weapon.grenade.frag.stats.info.explosion_size': 'Радиус поражения',
}

type RegistryPath =
	| 'armor'
	| 'artefact'
	| 'bags'
	| 'boosts'
	| 'attachments'
	| 'bullets'
	| 'grenades'

const defaultRegistries: Record<RegistryPath, Record<string, string>> = {
	armor: ARMOR_DEFAULT_REGISTRY,
	artefact: {},
	bags: BAGS_DEFAULT_REGISTRY,
	boosts: BOOSTS_DEFAULT_REGISTRY,
	attachments: ATTACHMENTS_DEFAULT_REGISTRY,
	bullets: BULLETS_DEFAULT_REGISTRY,
	grenades: GRENADES_DEFAULT_REGISTRY,
}

const registryFileNames: Record<RegistryPath, string> = {
	armor: 'armor_stats_registry.json',
	artefact: 'artefact_stats_registry.json',
	bags: 'bags_stats_registry.json',
	boosts: 'boosts_stats_registry.json',
	attachments: 'attachments_stats_registry.json',
	bullets: 'bullets_stats_registry.json',
	grenades: 'grenades_stats_registry.json',
}

export interface Registry {
	get(key: string): string | undefined
	set(key: string, value: string): void
	saveIfUpdated(): void
}

export function loadStatsRegistry(path: RegistryPath): Registry {
	const file = join(balanceConfig.diffsDir, registryFileNames[path])
	let statsMap: Record<string, string> = { ...defaultRegistries[path] }
	try {
		statsMap = { ...statsMap, ...JSON.parse(readFileSync(file, 'utf-8')) }
	} catch {
		// no registry
	}

	let updated = false

	return {
		get(key) {
			return statsMap[key]
		},
		set(key, value) {
			if (statsMap[key] !== value) {
				statsMap[key] = value
				updated = true
			}
		},
		saveIfUpdated() {
			if (!updated) return
			mkdirSync(dirname(file), { recursive: true })
			writeFileSync(file, JSON.stringify(statsMap, null, 2), 'utf-8')
			updated = false
		},
	}
}
