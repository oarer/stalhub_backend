import axios from 'axios'
import { env } from '@/env'

const MAX_INPUT_CHARS = 12_000
const MAX_DIGEST_CHARS = 1500

const DIGEST_SYSTEM_PROMPT = `Ты — редактор игрового портала StalHub (STALCRAFT).
По тексту статьи напиши краткую выжимку для анонса в Telegram и Discord.
Требования:
- 2–4 предложения, 300–600 символов.
- Только факты из текста, ничего не выдумывай.
- Язык выжимки — язык статьи (обычно русский).
- Первое предложение — суть новости.
- Без URL, хештегов и эмодзи.
- Верни ТОЛЬКО текст выжимки, без кавычек и пояснений.`


export function stripMarkdownToPlain(markdown: string): string {
	const plain = markdown
		.replace(/```(\w*)\n?/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^:::\s*\w*.*$/gm, ' ')
		.replace(/^:::\s*$/gm, ' ')
		.replace(/\{[\s\S]*?\}/g, ' ')
		.replace(/<\/?[^>]+>/g, ' ')
		.replace(/^[#>*_~|-]+\s?/gm, ' ')
		.replace(/[|*_`~]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	return plain.slice(0, MAX_INPUT_CHARS)
}

export function excerptFallback(
	title: string,
	content: string,
	maxLen = 500
): string {
	const plain = stripMarkdownToPlain(content)
	const cut = plain.slice(0, maxLen)
	const lastSpace = cut.lastIndexOf(' ')
	const body =
		plain.length <= maxLen
			? plain
			: `${cut.slice(0, lastSpace > 100 ? lastSpace : maxLen).trim()}…`
	return `${title}. ${body}`.slice(0, MAX_DIGEST_CHARS)
}

export async function generateBlogDigest(article: {
	title: string
	content: string
	tags?: string[]
}): Promise<{ digest: string; model: string; fallback: boolean }> {
	const plain = stripMarkdownToPlain(article.content ?? '')
	if (!plain) {
		return {
			digest: article.title.slice(0, MAX_DIGEST_CHARS),
			model: env.OPENAI_MODEL,
			fallback: true,
		}
	}

	try {
		const { data } = await axios.post(`${env.OPENAI_BASE_URL}/chat/completions`, {
				model: env.OPENAI_MODEL,
				temperature: 0.3,
				max_tokens: 500,
				messages: [
					{ role: 'system', content: DIGEST_SYSTEM_PROMPT },
					{
						role: 'user',
						content: `Заголовок: ${article.title}\nТеги: ${(article.tags ?? []).join(', ')}\nТекст:\n${plain}`,
					},
				],
			}, {
				timeout: 60_000,
				headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
			})
		const digest = (data.choices?.[0]?.message?.content ?? '')
			.trim()
			.slice(0, MAX_DIGEST_CHARS)
		if (!digest) throw new Error('Empty digest from LLM')
		return { digest, model: env.OPENAI_MODEL, fallback: false }
	} catch (err) {
		console.error(
			`[BlogDigest] LLM failed, using excerpt fallback: ${(err as Error).message}`
		)
		return {
			digest: excerptFallback(article.title, article.content),
			model: env.OPENAI_MODEL,
			fallback: true,
		}
	}
}
