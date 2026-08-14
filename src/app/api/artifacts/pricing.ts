import type {
	ArtifactAggregate,
	ArtifactPriceResult,
} from '@/types/artifacts.type'

const QUALITY_LEVELS = 7

const MAX_PTN = 15

const round = (n: number): number => Math.round(n)

const curvePoints = (
	curve: Record<string, number> | undefined
): [number, number][] => {
	if (!curve) return []
	const points = Object.entries(curve)
		.map(([ptn, ratio]) => [Number(ptn), ratio] as [number, number])
		.sort((a, b) => a[0] - b[0])

	if (points.length === 0) return []

	const head = points[0]
	if (head[0] > 0) return [[0, 1], ...points]
	return points
}

export const interpolateRatio = (
	curve: Record<string, number> | undefined,
	ptn: number
): number => {
	if (ptn <= 0) return 1

	const points = curvePoints(curve)
	if (points.length === 0) return 1

	const first = points[0]
	if (ptn <= first[0]) return first[1]

	const last = points[points.length - 1]
	if (ptn >= last[0]) {
		if (points.length < 2) return last[1]

		const [p1, r1] = points[points.length - 2]
		const slope = (last[1] - r1) / (last[0] - p1)
		const extrapolated = last[1] + slope * (ptn - last[0])
		const ratio = Math.max(last[1], extrapolated)
		const cap = Math.max(2, last[1] * 1.5)
		return Math.min(ratio, cap)
	}

	for (let i = 1; i < points.length; i++) {
		if (ptn <= points[i][0]) {
			const [p0, r0] = points[i - 1]
			const [p1, r1] = points[i]
			const t = (ptn - p0) / (p1 - p0)
			return r0 + (r1 - r0) * t
		}
	}

	return last[1]
}

const rowBase0 = (
	aggregate: ArtifactAggregate,
	itemId: string,
	qlt: number
): number | null => {
	const row = aggregate.items[itemId]?.[qlt]
	if (!row) return null

	const factor = interpolateRatio(aggregate.curves[String(qlt)], row.basePtn)
	if (!factor || factor <= 0) return row.baseMedian

	return row.baseMedian / factor
}

const lowestAvailableQlt = (
	aggregate: ArtifactAggregate,
	itemId: string
): number | null => {
	const rows = aggregate.items[itemId]
	if (!rows) return null

	for (let q = 0; q < QUALITY_LEVELS; q++) {
		if (rows[q]) return q
	}

	return null
}

const qualityRatioFor = (
	aggregate: ArtifactAggregate,
	qlt: number,
	anchorQlt: number
): number => {
	const qr = aggregate.qualityRatios
	const target = qr[String(qlt)]
	const anchor = qr[String(anchorQlt)]

	if (target != null && anchor != null && anchor > 0) {
		return target / anchor
	}

	const tiers = aggregate.tiers
	const targetTier = tiers[String(qlt)]
	const anchorTier = tiers[String(anchorQlt)]

	if (targetTier != null && anchorTier != null && anchorTier > 0) {
		return targetTier / anchorTier
	}

	return 1
}

export const resolveArtifactPrice = (
	aggregate: ArtifactAggregate,
	itemId: string,
	qlt: number,
	ptn: number
): ArtifactPriceResult => {
	const base: ArtifactPriceResult = {
		itemId,
		qlt,
		ptn,
		price: null,
		source: null,
		count: 0,
	}

	if (qlt < 0 || qlt >= QUALITY_LEVELS || ptn < 0 || ptn > MAX_PTN) {
		return base
	}

	const ratio = interpolateRatio(aggregate.curves[String(qlt)], ptn)

	const rows = aggregate.items[itemId]
	const row = rows?.[qlt]

	if (row) {
		const cell = row.cells[String(ptn)]
		if (cell) {
			return {
				...base,
				price: cell.min,
				source: 'market',
				count: cell.count,
			}
		}

		const base0 = rowBase0(aggregate, itemId, qlt)
		if (base0 != null) {
			return {
				...base,
				price: round(base0 * ratio),
				source: 'estimate',
				count: 0,
			}
		}
	}

	if (rows) {
		const anchorQlt = lowestAvailableQlt(aggregate, itemId)
		if (anchorQlt != null) {
			const anchorBase0 = rowBase0(aggregate, itemId, anchorQlt)
			if (anchorBase0 != null) {
				const price =
					anchorBase0 *
					qualityRatioFor(aggregate, qlt, anchorQlt) *
					ratio
				if (Number.isFinite(price)) {
					return {
						...base,
						price: round(price),
						source: 'estimate',
						count: 0,
					}
				}
			}
		}
	}

	const tier = aggregate.tiers[String(qlt)]
	if (tier != null) {
		return {
			...base,
			price: round(tier * ratio),
			source: 'estimate',
			count: 0,
		}
	}

	return base
}
