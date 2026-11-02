import { describe, expect, test } from 'bun:test'
import type { UnoRawPlayer } from '@/types/uno.type'
import { compactPlayerGear } from './compact'
import { parsePlayerGear } from './gear'

const player: UnoRawPlayer = {
	name: 'Tester',
	faction: 'duty',
	clan: 'Clan',
	tag: 'TAG',
	clan_rank: 2,
	gear: {
		slot_2: {
			nbt: { id: 200, Count_i: 1, Damage: 0, tag: { owner: 'Tester' } },
			name: 'Skin',
			definition: 'assets\\stalker\\items\\skins\\skins.json',
		},
		slot_1: {
			nbt: {
				id: 100,
				Count_i: 1,
				Damage: 0,
				tag: {
					owner: 'Tester',
					upgrade_level: 14,
					failed_upgrades: 3,
					material: 'bf_skin_13',
				},
			},
			name: 'Armor',
			definition: 'assets\\stalker\\items\\armor\\armor.json',
			attachments: {
				motif: {
					id: 101,
					name: 'Motif',
					definition: 'assets\\weapons\\items\\att\\skins_uniq.json',
				},
			},
		},
		slot_3: {
			nbt: {
				id: 300,
				Count_i: 1,
				Damage: 0,
				tag: {
					owner: 'Tester',
					upgrade_level: 10,
					attach: {
						slot_mount1: {
							id: 301,
							tag: { is_inbuilt: 1 },
							Damage: 0,
							Count_i: 1,
						},
						module: {
							id: 302,
							tag: {
								qlt: 2,
								attributes: [
									{
										type: 1,
										definitionId: 'draw_time_suf',
										quality: 2,
										statsRandom: -0.5,
									},
								],
							},
							Damage: 0,
							Count_i: 1,
						},
					},
				},
			},
			name: 'Weapon',
			definition: 'assets\\weapons\\items\\drobov\\weapon.json',
			attachments: {
				slot_mount1: {
					id: 301,
					name: null,
					definition: 'assets\\weapons\\items\\att\\other.json',
				},
				module: {
					id: 302,
					name: 'Module',
					definition: 'assets\\weapons\\items\\modules.json',
					quality: 2,
				},
			},
		},
		slot_5: {
			nbt: {
				id: 500,
				Count_i: 1,
				Damage: 0,
				tag: {
					owner: 'Tester',
					attach: {
						1: {
							id: 502,
							tag: {
								qlt: 2,
								bonus_properties: ['SPEED_MOD'],
							},
						},
						0: {
							id: 501,
							tag: {
								qlt: 1,
								ndmg: 0.5,
								bonus_properties: ['STAMINA_BONUS'],
							},
						},
					},
				},
			},
			name: 'Backpack',
			definition: 'assets\\stalker\\items\\other\\backpacks_new.json',
			attachments: {
				0: {
					id: 501,
					name: 'Artifact A',
					definition: 'assets\\stalker\\items\\artefacts\\a.json',
					quality: 1,
					bonus_properties: ['STAMINA_BONUS'],
				},
				1: {
					id: 502,
					name: 'Artifact B',
					definition: 'assets\\stalker\\items\\artefacts\\b.json',
					quality: 2,
					bonus_properties: ['SPEED_MOD'],
				},
			},
		},
	},
}

describe('UNO gear parser', () => {
	test('sorts slots and exposes item metadata', () => {
		const result = parsePlayerGear(player)

		expect(result.name).toBe('Tester')
		expect(result.items.map((item) => item.slot)).toEqual([
			'slot_1',
			'slot_2',
			'slot_3',
			'slot_5',
		])

		const armor = result.items[0]
		expect(armor.slotType).toBe('armor')
		expect(armor.category).toBe('armor')
		expect(armor.upgradeLevel).toBe(14)
		expect(armor.skin).toBe('bf_skin_13')
		expect(armor.attachments[0].name).toBe('Motif')
	})

	test('merges attachment metadata with raw NBT tags', () => {
		const weapon = parsePlayerGear(player).items[2]
		const mount = weapon.attachments.find(
			(attachment) => attachment.slot === 'slot_mount1'
		)
		const module = weapon.attachments.find(
			(attachment) => attachment.slot === 'module'
		)

		expect(mount?.inbuilt).toBe(true)
		expect(module?.quality).toBe(2)
		expect(module?.attributes).toEqual([
			{
				type: 1,
				definitionId: 'draw_time_suf',
				quality: 2,
				statsRandom: -0.5,
			},
		])
	})
	test('orders numbered artifact attachments and keeps bonus properties', () => {
		const backpack = parsePlayerGear(player).items[3]
		const compactBackpack = compactPlayerGear(parsePlayerGear(player))
			.items[3]

		expect(
			backpack.attachments.map((attachment) => attachment.slot)
		).toEqual(['0', '1'])
		expect(backpack.attachments[0].slotLabel).toBe('artifact_1')
		expect(backpack.attachments[0].ndmg).toBe(0.5)
		expect(compactBackpack.attachments[0].ndmg).toBe(0.5)
		expect(backpack.attachments[1].bonusProperties).toEqual(['SPEED_MOD'])
	})

	test('compact response keeps only requested fields and includes container', () => {
		const summary = compactPlayerGear(parsePlayerGear(player))
		const backpack = summary.items.find(
			(item) => item.slotType === 'backpack'
		)

		expect(summary.name).toBe('Tester')
		expect(backpack?.slotType).toBe('backpack')
		expect(backpack?.attachments.map((item) => item.itemId)).toEqual([
			null,
			null,
		])
		expect(summary.items[0]).toEqual({
			slot: 'slot_1',
			slotType: 'armor',
			itemId: null,
			name: 'Armor',
			db: null,
			gameId: 100,
			upgrade: {
				level: 14,
				failedAttempts: 3,
				compensatedAttempts: null,
			},
			quality: null,
			potential: null,
			upgradeBonus: null,
			randomStats: null,
			attachments: [
				{
					slot: 'motif',
					slotLabel: 'motif',
					itemId: null,
					name: 'Motif',
					db: null,
					gameId: 101,
					quality: null,
					potential: null,
					ndmg: null,
					upgradeBonus: null,
					randomStats: null,
					bonusProperties: null,
					attributes: [],
				},
			],
		})
	})

	test('resolves listing ids by name and exposes upgrade details', () => {
		const seen: Array<[string | null, string | null | undefined]> = []
		const result = parsePlayerGear(player, (name, category) => {
			seen.push([name, category])
			if (name === 'Armor') {
				return {
					id: 'armor-id',
					name: 'Armor',
					category: 'armor/combined',
					type: 'armor',
					color: 'RANK_LEGEND',
					state: 'PERSONAL_ON_USE',
				}
			}
			return null
		})

		const armor = result.items[0]
		expect(armor.itemId).toBe('armor-id')
		expect(armor.db?.type).toBe('armor')
		expect(armor.upgrade).toEqual({
			level: 14,
			failedAttempts: 3,
			compensatedAttempts: null,
		})
		expect(seen).toContainEqual(['Armor', 'armor'])
		expect(parsePlayerGear(player).items[0].itemId).toBeNull()
	})
})
