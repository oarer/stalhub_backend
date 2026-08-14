import { readFile } from 'node:fs/promises'
import axios from 'axios'
import { aiAnalysisDuration, aiAnalysisTotal } from '@/app/api/metrics'
import { SYSTEM_PROMPT } from '@/data/prompt'
import { env } from '@/env'
import type { AIScreenshotResult } from '../types'

const MAX_ATTEMPTS = 3

export async function analyzeScreenshot(
	filePath: string
): Promise<AIScreenshotResult> {
	const buf = await readFile(filePath)
	const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
	const start = Date.now()

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const { data } = await axios.post(
				`${env.OPENAI_BASE_URL}/chat/completions`,
				{
					model: env.OPENAI_MODEL,
					max_tokens: 2000,
					response_format: { type: 'json_object' },
					messages: [
						{ role: 'system', content: SYSTEM_PROMPT },
						{
							role: 'user',
							content: [
								{
									type: 'text',
									text: 'Extract data from this screenshot.',
								},
								{
									type: 'image_url',
									image_url: { url: dataUrl, detail: 'high' },
								},
							],
						},
					],
				},
				{
					timeout: 60_000,
					headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
				}
			)
			const raw = data.choices?.[0]?.message?.content ?? '{}'
			const parsed = JSON.parse(raw) as AIScreenshotResult
			aiAnalysisTotal.inc({ status: 'success' })
			aiAnalysisDuration.observe((Date.now() - start) / 1000)
			return { ...parsed, rawText: raw }
		} catch (err) {
			const isLast = attempt === MAX_ATTEMPTS
			aiAnalysisTotal.inc({ status: isLast ? 'error' : 'retry' })
			if (isLast) {
				aiAnalysisDuration.observe((Date.now() - start) / 1000)
				throw err
			}
			console.error(
				`[AI] Analysis attempt ${attempt}/${MAX_ATTEMPTS} failed: ${(err as Error).message}, retrying...`
			)
			await new Promise((r) => setTimeout(r, attempt * 2000))
		}
	}

	throw new Error('Unreachable')
}
