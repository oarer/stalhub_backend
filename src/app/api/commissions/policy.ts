export class CommissionError extends Error {
	constructor(
		public status: number,
		public code: string
	) {
		super(code)
	}
}

export function ensure(
	condition: unknown,
	code: string,
	status = 400
): asserts condition {
	if (!condition) throw new CommissionError(status, code)
}

export const terminal = new Set(['COMPLETED', 'CANCELLED', 'DECLINED'])
export const currencies = ['RUB', 'USD', 'EUR'] as const
export const maxAmount = 100_000_000

export function money(value: number) {
	ensure(
		Number.isSafeInteger(value) && value > 0 && value <= maxAmount,
		'INVALID_AMOUNT'
	)
	return value
}

export function priceTotal(items: { amount: number }[]) {
	ensure(items.length > 0 && items.length <= 20, 'SELECT_PRICES')
	return money(items.reduce((sum, item) => sum + money(item.amount), 0))
}

export function paymentPlan(
	total: number,
	payments: { amount: number; upfront: boolean }[]
) {
	ensure(payments.length > 0 && payments.length <= 10, 'INVALID_PAYMENTS')
	ensure(priceTotal(payments) === total, 'PAYMENT_TOTAL_MISMATCH')
	ensure(
		payments.some((p) => p.upfront),
		'UPFRONT_REQUIRED'
	)
}

export function refundAvailable(
	payments: { amount: number; status: string }[],
	refunds: { amount: number }[]
) {
	return (
		payments
			.filter((p) => p.status === 'RECEIVED')
			.reduce((s, p) => s + p.amount, 0) -
		refunds.reduce((s, p) => s + p.amount, 0)
	)
}

export function futureDate(value: string) {
	const date = new Date(value)
	ensure(
		Number.isFinite(date.getTime()) && date.getTime() > Date.now(),
		'FUTURE_DATE_REQUIRED'
	)
	return date
}

export function text(value: string, min = 1, max = 10_000) {
	const trimmed = value.trim()
	ensure(
		trimmed.length >= min &&
			trimmed.length <= max &&
			!trimmed.includes('\0'),
		'INVALID_TEXT'
	)
	return trimmed
}

export function participant(
	order: { customer_id: number; artist_id: number },
	id: number
) {
	return order.customer_id === id || order.artist_id === id
}

export function canRate(
	order: { status: string; artist_id: number; customer_id: number },
	actor: number,
	disputed: boolean
) {
	return (
		order.artist_id === actor &&
		actor !== order.customer_id &&
		order.status === 'COMPLETED' &&
		!disputed
	)
}
