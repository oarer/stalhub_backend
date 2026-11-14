import { describe, expect, test } from 'bun:test'
import {
	extractImageLinks,
	extractMessage,
	extractVideoLinks,
	formatDevMessage,
	toPlainFallback,
} from '@/app/api/eforum/format'
import { toFrontendItem } from '@/app/api/eforum/present'

const mention = (id: string, name: string, postId: number, n = 1) =>
	`<a href="https://forum.exbo.net/d/${id}-slug/${n}" class="PostMention" data-id="${postId}">${name}</a>`

describe('eforum html parsing', () => {
	test('keeps paragraphs and images instead of gluing lines', () => {
		const parsed = extractMessage(
			'<p>Первая строка</p>\n\n<p><img class="FoFUpload--Upl-Image-Preview" src="https://forum-cdn.exbo.net/a.png" alt=""></p>'
		)
		expect(parsed.quotes).toHaveLength(0)
		expect(parsed.responseHtml).toBe(
			'Первая строка\n\n<a href="https://forum-cdn.exbo.net/a.png">фото</a>'
		)
	})

	test('keeps quote and answer in original order', () => {
		const html = [
			`<p>Вступление</p>`,
			`<blockquote class="uncited"><div><p>${mention('1', 'Glebster', 51)} первая цитата</p></div></blockquote>`,
			`<p>Мой ответ</p>`,
			`<blockquote class="uncited"><div><p>${mention('1', 'Glebster', 51)} вторая цитата</p></div></blockquote>`,
		].join('\n\n')

		const parsed = extractMessage(html)
		expect(parsed.blocks.map((block) => block.kind)).toEqual([
			'text',
			'quote',
			'text',
			'quote',
		])
		expect(
			parsed.quotes.every((quote) => quote.author === 'Glebster')
		).toBe(true)
		expect(parsed.quotes[0].html).toBe('первая цитата')
		expect(parsed.quotes[0].postId).toBe('51')
		expect(parsed.responseHtml).toBe('Вступление\n\nМой ответ')
	})

	test('takes username from href, not from the visible display name', () => {
		const parsed = extractMessage(
			`<blockquote><div><p>${mention('133912', 'Isla_mp', 4762204)} текст</p></div></blockquote>`
		)
		expect(parsed.quotes[0].author).toBe('Isla_mp')
		expect(parsed.quotes[0].authorUrl).toBe(
			'https://forum.exbo.net/u/Isla_mp'
		)
	})

	test('detects reply mention but marks UserMention as a plain mention', () => {
		const reply = extractMessage(
			`<p>${mention('1', 'Tank', 4763010)} ответ на сообщение</p>`
		)
		expect(reply.reply?.postId).toBe('4763010')

		const mentionOnly = extractMessage(
			'<p><a href="https://forum.exbo.net/u/Marxont" class="UserMention">@Marxont</a> просто упоминание</p>'
		)
		expect(mentionOnly.reply).toBeNull()
		expect(mentionOnly.responseHtml).toBe(
			'<a href="https://forum.exbo.net/u/Marxont">@Marxont</a> просто упоминание'
		)
	})

	test('renders lists, spoilers, emoji and removes markup junk', () => {
		const html = [
			'<p>до<span class="spoiler" onclick="removeAttribute(\'class\')">спойлер</span></p>',
			'<ol><li>первый</li><li>второй</li></ol>',
			'<p>эмодзи <img class="emoji" alt="🔥" src="/assets/emoji/fire.png"></p>',
			'<script>alert(1)</script><style>p{}</style>',
			'<p><a href="javascript:alert(1)">плохая ссылка</a></p>',
		].join('\n')

		const text = extractMessage(html).responseHtml
		expect(text).toContain('<tg-spoiler>спойлер</tg-spoiler>')
		expect(text).toContain('1. первый\n2. второй')
		expect(text).toContain('🔥')
		expect(text).not.toContain('alert(1)')
		expect(text).not.toContain('javascript:')
	})

	test('decodes entities and escapes html again', () => {
		const parsed = extractMessage(
			'<p>a &lt; b &amp;&amp; c &gt; d &#128512;</p>'
		)
		expect(parsed.responseHtml).toBe('a &lt; b &amp;&amp; c &gt; d 😀')
	})

	test('extracts images and videos, skipping emoji pictures', () => {
		const html = [
			'<p><img class="emoji" alt="🔥" src="/assets/emoji/fire.png"></p>',
			'<p><img src="//forum-cdn.exbo.net/a.png"></p>',
			'<iframe src="https://www.youtube-nocookie.com/embed/jQ5NU1AmH5A"></iframe>',
		].join('')
		expect(extractImageLinks(html)).toEqual([
			'https://forum-cdn.exbo.net/a.png',
		])
		expect(extractVideoLinks(html)).toEqual([
			'https://www.youtube.com/watch?v=jQ5NU1AmH5A',
		])
	})

	test('returns empty parse for markup without content', () => {
		expect(extractMessage('<p>   </p><p> </p>')).toEqual({
			blocks: [],
			quotes: [],
			responseHtml: '',
			reply: null,
		})
	})
})

describe('eforum message formatting', () => {
	test('builds telegram html with quote, answer, title and link', async () => {
		const formatted = await formatDevMessage({
			author: 'Marxont',
			discussionTitle: 'Хорошо, что я ушел из игры',
			contentHtml: `<blockquote><div><p>${mention('197998', 'Glebster', 4762519)} 400 человек</p></div></blockquote><p>Мой ответ</p>`,
			messageLink: 'https://forum.exbo.net/d/197998/54',
			authorDisplayName: 'Marxont',
			authorAvatarUrl: 'https://forum.exbo.net/assets/avatars/a.png',
		})

		expect(formatted.authorAvatarUrl).toBe(
			'https://forum.exbo.net/assets/avatars/a.png'
		)
		expect(formatted.telegramHtml).toContain('Новый комментарий от')
		expect(formatted.telegramHtml).toContain(
			'<b>💬 Хорошо, что я ушел из игры</b>'
		)
		expect(formatted.telegramHtml).toContain(
			'<b>Glebster написал:</b>\n<blockquote expandable>400 человек</blockquote>'
		)
		expect(formatted.telegramHtml).toContain('Мой ответ')
		expect(formatted.telegramHtml).toContain('#Marxont')
	})

	test('loads original post for a bare reply mention and drops the duplicate @nick', async () => {
		const formatted = await formatDevMessage(
			{
				author: 'ZIV',
				contentHtml: `<p>${mention('133912', 'MonsterRacer', 4762218)} а в чем рофл</p>`,
				messageLink: 'https://forum.exbo.net/d/133912/7830',
			},
			{
				loadOriginalPost: async () => ({
					content: '<p>Ну, можно было-бы и без рофлов ответить</p>',
					author: 'MonsterRacer',
					authorDisplayName: 'MonsterRacer',
					avatarUrl: 'https://forum.exbo.net/assets/avatars/b.png',
				}),
			}
		)

		expect(formatted.quotes).toHaveLength(1)
		expect(formatted.quotes[0].authorAvatarUrl).toBe(
			'https://forum.exbo.net/assets/avatars/b.png'
		)
		expect(formatted.responseHtml).toBe('а в чем рофл')
	})

	test('resolves avatars and display names for quote authors', async () => {
		const formatted = await formatDevMessage(
			{
				author: 'ZIV',
				contentHtml: `<blockquote><div><p>${mention('1', 'stm:1', 5)} цитата</p></div></blockquote>`,
				messageLink: 'https://forum.exbo.net/d/1/1',
			},
			{
				resolveUser: async () => ({
					avatarUrl: 'https://forum.exbo.net/assets/avatars/c.png',
					displayName: 'Patsyuk_gorki',
				}),
			}
		)

		expect(formatted.quotes[0].author).toBe('stm:1')
		expect(formatted.quotes[0].authorDisplayName).toBe('Patsyuk_gorki')
		expect(formatted.quotes[0].authorAvatarUrl).toBe(
			'https://forum.exbo.net/assets/avatars/c.png'
		)
		expect(formatted.telegramHtml).toContain(
			'<b>Patsyuk_gorki написал:</b>'
		)
	})

	test('falls back to attachments for embed-only posts', async () => {
		const formatted = await formatDevMessage({
			author: 'ZIV',
			contentHtml:
				'<p><iframe src="https://www.youtube.com/embed/jQ5NU1AmH5A"></iframe></p>',
			messageLink: 'https://forum.exbo.net/d/1/1',
		})
		expect(formatted.telegramHtml).toContain('🎬 видео')
		expect(formatted.telegramHtml).toContain(
			'https://www.youtube.com/watch?v=jQ5NU1AmH5A'
		)
	})

	test('plain fallback strips telegram markup', async () => {
		const formatted = await formatDevMessage({
			author: 'ZIV',
			contentHtml: '<p><b>жирный</b> текст</p>',
			messageLink: 'https://forum.exbo.net/d/1/1',
		})
		const plain = toPlainFallback(formatted.telegramHtml)
		expect(plain).toContain('жирный текст')
		expect(plain).not.toContain('<b>')
	})
})

describe('eforum frontend projection', () => {
	test('exposes avatar, display name, title and ordered blocks', () => {
		const item = toFrontendItem({
			postId: '1',
			author: 'Marxont',
			authorDisplayName: 'Marxont',
			authorAvatarUrl: 'https://forum.exbo.net/assets/avatars/a.png',
			authorProfileUrl: 'https://forum.exbo.net/u/Marxont',
			link: 'https://forum.exbo.net/d/1/1',
			slug: '1-slug',
			discussionTitle: 'Тема',
			postNumber: 1,
			forumCreatedAt: '2026-11-14T00:00:00+00:00',
			contentHtml: '<p>текст</p>',
			telegramHtml: '',
			plainText: '',
			blocks: [
				{
					kind: 'quote',
					author: 'Glebster',
					authorDisplayName: 'Glebster',
					authorUrl: 'https://forum.exbo.net/u/Glebster',
					authorAvatarUrl:
						'https://forum.exbo.net/assets/avatars/b.png',
					link: null,
					postId: '51',
					html: 'цитата',
				},
				{ kind: 'text', html: 'ответ' },
			],
			quotes: [
				{
					author: 'Glebster',
					authorDisplayName: 'Glebster',
					authorUrl: 'https://forum.exbo.net/u/Glebster',
					authorAvatarUrl:
						'https://forum.exbo.net/assets/avatars/b.png',
					link: null,
					postId: '51',
					html: 'цитата',
				},
			],
			responseHtml: 'ответ',
			checkedAt: '2026-11-14T00:00:00.000Z',
		})

		expect(item.author).toEqual({
			name: 'Marxont',
			displayName: 'Marxont',
			profileUrl: 'https://forum.exbo.net/u/Marxont',
			avatarUrl: 'https://forum.exbo.net/assets/avatars/a.png',
		})
		expect(item.discussion.title).toBe('Тема')
		expect(item.blocks.map((block) => block.kind)).toEqual([
			'quote',
			'text',
		])
		expect(item.blocks[0].quote?.authorAvatarUrl).toBe(
			'https://forum.exbo.net/assets/avatars/b.png'
		)
		expect(item.text).toBe('Glebster:\nцитата\n\nответ')
	})
})
