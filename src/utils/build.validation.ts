import { z } from 'zod'
import { ArtQuality, BoostCategory, type BuildData } from '@/types/build.type'

const MAX_ARTS = 15
const MAX_SELECTED_STATS = 6
const MAX_BOOST_ENTRIES = 10

const ArtSchema = z.object({
	instanceId: z.string(),
	itemId: z.string(),
	percent: z.number().min(85).max(190),
	potential: z.number(),
	selectedStats: z.array(z.string().nullable()).max(MAX_SELECTED_STATS),
	qualityClass: z.nativeEnum(ArtQuality),
})

const BoostSchema = z
	.record(z.nativeEnum(BoostCategory), z.string().nullable())
	.refine((obj) => Object.keys(obj).length <= MAX_BOOST_ENTRIES, {
		message: `boost exceeds maximum of ${MAX_BOOST_ENTRIES} entries`,
	})

const ArmorSchema = z.object({
	id: z.string(),
	level: z.number(),
})

const ContainerSchema = z.object({
	id: z.string(),
	slots: z.array(z.string().nullable()),
})

export const BuildDataSchema = z.object({
	arts: z.array(ArtSchema).max(MAX_ARTS),
	boost: BoostSchema,
	armor: ArmorSchema.nullable().default(null),
	container: ContainerSchema.nullable().default(null),
})

export function validateBuildData(input: unknown):
	| { ok: true; data: BuildData }
	| { ok: false; error: string } {
	const result = BuildDataSchema.safeParse(input)
	if (result.success) {
		return { ok: true, data: result.data as BuildData }
	}
	return { ok: false, error: result.error.issues[0].message }
}
