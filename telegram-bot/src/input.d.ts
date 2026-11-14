declare module 'input' {
	const input: {
		text(prompt: string): Promise<string>
	}
	export default input
}
