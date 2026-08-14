function ts(): string {
	return new Date().toISOString()
}

function fmt(args: unknown[]): string {
	return args
		.map((a) =>
			a instanceof Error
				? `${a.message}\n${a.stack ?? ''}`
				: typeof a === 'string'
					? a
					: JSON.stringify(a)
		)
		.join(' ')
}

export const log = (...args: unknown[]) => console.log(`[${ts()}]`, fmt(args))
export const warn = (...args: unknown[]) =>
	console.warn(`[${ts()}] [WARN]`, fmt(args))
export const error = (...args: unknown[]) =>
	console.error(`[${ts()}] [ERROR]`, fmt(args))
