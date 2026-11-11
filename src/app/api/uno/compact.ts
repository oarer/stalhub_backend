import type {
	UnoGearAttachmentSummary,
	UnoGearItemSummary,
	UnoPlayerGear,
	UnoPlayerGearSummary,
} from '@/types/uno.type'

function compactAttachment(
	attachment: UnoPlayerGear['items'][number]['attachments'][number]
): UnoGearAttachmentSummary {
	return {
		slot: attachment.slot,
		slotLabel: attachment.slotLabel,
		itemId: attachment.itemId,
		name: attachment.name,
		db: attachment.db,
		gameId: attachment.id,
		quality: attachment.quality,
		potential: attachment.potential,
		ndmg: attachment.ndmg,
		upgradeBonus: attachment.upgradeBonus,
		randomStats: attachment.randomStats,
		bonusProperties: attachment.bonusProperties,
		attributes: attachment.attributes,
	}
}

function compactItem(item: UnoPlayerGear['items'][number]): UnoGearItemSummary {
	return {
		slot: item.slot,
		slotType: item.slotType,
		itemId: item.itemId,
		name: item.name,
		db: item.db,
		gameId: item.id,
		upgrade: item.upgrade,
		quality: item.quality,
		potential: item.potential,
		upgradeBonus: item.upgradeBonus,
		randomStats: item.randomStats,
		attachments: item.attachments.map(compactAttachment),
	}
}

export function compactPlayerGear(gear: UnoPlayerGear): UnoPlayerGearSummary {
	return {
		name: gear.name,
		strings: gear.strings,
		items: gear.items.map(compactItem),
	}
}
