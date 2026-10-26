import { afterEach, describe, expect, test } from 'bun:test'
import { RenderError, renderSvgPng } from '../src/render'

const config = {
	imageServiceUrl: 'http://render.example',
	requestTimeoutMs: 1_000,
}

describe('renderSvgPng', () => {
	const originalFetch = globalThis.fetch

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	test('posts svg to the image service and returns png bytes', async () => {
		let requestUrl = ''
		let requestBody = ''
		let requestHeaders: Record<string, string> = {}
		let requestMethod = ''
		globalThis.fetch = (async (
			url: string | URL | Request,
			init?: RequestInit
		) => {
			requestUrl = String(url)
			requestMethod = init?.method ?? 'GET'
			requestBody = String(init?.body ?? '')
			requestHeaders = Object.fromEntries(
				new Headers(init?.headers).entries()
			)
			return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
				status: 200,
				headers: { 'content-type': 'image/png' },
			})
		}) as unknown as typeof fetch

		const data = await renderSvgPng(config, '<svg></svg>')

		expect(requestUrl).toBe('http://render.example/svg-to-png')
		expect(requestMethod).toBe('POST')
		expect(requestBody).toBe('<svg></svg>')
		expect(requestHeaders['content-type']).toBe('image/svg+xml')
		expect([...data]).toEqual([0x89, 0x50, 0x4e, 0x47])
	})

	test('throws RenderError on non-2xx response', async () => {
		globalThis.fetch = (async () => {
			return new Response('boom', { status: 500 })
		}) as unknown as typeof fetch
		expect(
			await renderSvgPng(config, '<svg></svg>').catch((e) => e)
		).toBeInstanceOf(RenderError)
	})

	test('throws RenderError when no bytes are returned', async () => {
		globalThis.fetch = (async () => {
			return new Response(new Uint8Array(0), { status: 200 })
		}) as unknown as typeof fetch
		expect(
			await renderSvgPng(config, '<svg></svg>').catch((e) => e)
		).toBeInstanceOf(RenderError)
	})

	test('normalizes trailing slash in the service url', async () => {
		let requestUrl = ''
		globalThis.fetch = (async (url: string | URL | Request) => {
			requestUrl = String(url)
			return new Response(new Uint8Array([1]), { status: 200 })
		}) as unknown as typeof fetch
		await renderSvgPng(
			{ ...config, imageServiceUrl: 'http://render.example/' },
			'<svg></svg>'
		)
		expect(requestUrl).toBe('http://render.example/svg-to-png')
	})
})
