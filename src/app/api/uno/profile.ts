import type { UnoRawPlayer } from '@/types/uno.type'
import { compactPlayerGear } from './compact'
import { parsePlayerGear } from './gear'
import { getUnoItemLookup } from './item-db'
import { unoService } from './service'

export async function getUnoPlayerProfile(
	nickname: string,
	signal?: AbortSignal
) {
	const [player, lookup] = await Promise.all([
		unoService.request<UnoRawPlayer>(
			`/players/${encodeURIComponent(nickname)}`,
			{},
			{ signal }
		),
		getUnoItemLookup(),
	])
	const gear = compactPlayerGear(parsePlayerGear(player, lookup))

	return {
		gear,
		strings: gear.strings,
	}
}
