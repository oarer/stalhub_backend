# Лента

Единая публичная лента сборок (`build`), тир-листов (`tier_list`), текстовых постов (`post`) и работ художников (`art`). Посты публикуются сразу, без модерации.

Все пути имеют префикс `/api/v1`.

## `GET /feed`

Публичный endpoint. При наличии валидной авторизации в каждом элементе заполняется `is_starred`; для анонимного запроса оно `false`. Скрытые через `hide-from-feed` builds и tier-lists не возвращаются.

### Параметры

| Поле | Описание | По умолчанию |
| --- | --- | --- |
| `types` | Чеклист типов контента: `build`, `tier_list`, `post`, `art`. Повторяемый (`?types=build&types=art`), либо через запятую (`?types=build,art`). Пустой список / отсутствие — все типы | все |
| `type` | Устаревший одиночный фильтр: `all`, `build`, `tier_list`, `post` или `art`. Применяется, только если `types` не передан | `all` |
| `page` | Номер страницы, начиная с 1 | `1` |
| `take` | Элементов на странице, максимум 100 | `24` |
| `sort` | `new` или `top` | `new` |

`types` — именно чеклист: передаются только те типы, которые нужно показать, порядок не важен. Если `types` не передан, поведение обратно совместимо с `type`.

`sort=new` сортирует все четыре типа по `created_at DESC`. `sort=top` использует окно последних 28 дней и сортирует по `stars_count DESC`, затем по `created_at DESC`.

### Post item

```json
{
  "type": "post",
  "stars_count": 3,
  "comments_count": 1,
  "is_starred": false,
  "post": {
    "id": 5,
    "external_id": "x7y8z9",
    "title": null,
    "content": "Текст поста",
    "image_urls": ["https://cdn.example/image.jpg"],
    "source": "USER",
    "author": { "id": 1, "name": "Имя", "username": "user" },
    "author_name": null,
    "poll": {
      "id": 7,
      "question": "Выберите вариант",
      "type": "multiple",
      "options": [
        { "id": 10, "text": "A", "votes_count": 3 },
        { "id": 11, "text": "B", "votes_count": 2 }
      ],
      "total_votes": 5,
      "my_vote_option_ids": [10]
    },
    "attached_builds": [],
    "attached_tier_lists": [],
    "repost_of": null,
    "created_at": "2026-11-13T10:00:00.000Z",
    "updated_at": "2026-11-13T10:00:00.000Z"
  }
}
```

`my_vote_option_ids` пуст для анонимных запросов. `author` может быть `null` для automatic posts; в этом случае используется `author_name`.

### Art item

Art items используют тот же lightweight projection, что и `/arts`: `id`, `external_id`, `type`, `title`, `description`, `image_url`, `image_urls`, `tags`, `views`, resolved `author`, counters и timestamps. В feed попадают arts, доступные существующему публичному arts list.

### Attachments и reposts

`attached_builds` содержит build list projections. `attached_tier_lists` содержит tier-list list projections. Attachment rule: builds должны существовать (они следуют текущему публичному build listing), а tier-lists должны принадлежать автору поста либо быть `is_public = true` и `removed_at = null`.

Repost item имеет `repost_of`:

```json
{
  "external_id": "original-id",
  "title": "Original title",
  "content": "Excerpt limited to about 200 characters...",
  "image_urls": [],
  "author": { "id": 2, "name": "Автор", "username": "author" },
  "author_name": null,
  "created_at": "2026-11-12T10:00:00.000Z"
}
```

## Posts CRUD

### `POST /posts`

Auth required. Body:

```json
{
  "title": "Optional title",
  "content": "Text",
  "image_urls": ["https://cdn.example/image.jpg"],
  "poll": {
    "question": "Question",
    "type": "single",
    "options": ["A", "B"]
  },
  "attached_build_ids": [1],
  "attached_tier_list_ids": [2]
}
```

Posts publish immediately. Creation uses global rate-limit/auto-ban, XSS filtering and `enforceContentSpam`. Polls have 2–10 unique options. Response: `{ "post": PostProjection }`.

### `GET /posts/:external_id`

Public detail endpoint. Returns `{ "post": PostProjection }`; optional auth fills `is_starred` and poll `my_vote_option_ids`.

### `PATCH /posts/:external_id`

Author-only, with admin fallback using `user:manage`. Supports `title`, `content`, `image_urls`, `attached_build_ids` and `attached_tier_list_ids`. XSS filtering is applied to text fields.

### `DELETE /posts/:external_id`

Author-only, with admin fallback using `user:manage`.

### `POST /posts/:external_id/repost`

Auth required. Body `{ "content?: string" }`. Creates a new post owned by the reposter, with its own stars/comments and `repost_of` attribution to the original. The original is not changed.

## Poll voting

- `POST /posts/:external_id/poll/vote` — `{ "option_ids": [10] }`; single-choice requires exactly one option, multiple-choice requires at least one. Existing votes are replaced transactionally.
- `DELETE /posts/:external_id/poll/vote` — retracts the current user’s votes.
- `DELETE /posts/:external_id/poll` — poll author only; cascades options and votes.

Vote counters are maintained transactionally. Voting is idempotent for the resulting option set.

## Stars

- `POST/DELETE /tier-lists/:id/star`
- `POST/DELETE /posts/:external_id/star`

Stars use the polymorphic `Star` table and unique `(target_type, target_id, user_id)`. `GET /users/@me/stars` resolves tier-list, post and art targets.

## Hide from feed

Authors can hide or restore their own build/tier-list:

- `POST/DELETE /builds/:id/hide-from-feed`
- `POST/DELETE /tier-lists/:id/hide-from-feed`

The content remains available through its detail endpoint but is excluded from `/feed` while hidden.

## Comments

The existing polymorphic `article_comments` table accepts `build_id`, `tier_list_id` and `post_id`:

- `GET/POST /builds/:id/comments`
- `GET/POST /tier-lists/:id/comments`
- `GET/POST /posts/:external_id/comments`
- `DELETE /.../:comment_id`

Comments retain XSS filtering, `SPAM_LIMIT_COMMENT`, nested replies, mentions, author notifications and transactional counters.

## Auto-posts

### Internal ingest

`POST /api/v1/internal/feed-posts` accepts:

```json
{
  "source": "EXBO_TG",
  "external_key": "message:123",
  "content": "Imported text",
  "image_urls": [],
  "author_name": "Source author"
}
```

Allowed sources: `EXBO_TG`, `STALZONE_REPORT`, `OFFICIAL_MEDIA`. It uses the exact internal bot authentication: header `x-bot-secret` must equal the backend `DISCORD_BOT_SERVICE_JWT` environment value. The endpoint creates an authorless Post with `author_name`, and deduplicates by `(source, external_key)`, returning the existing post with `created: false` on duplicates.

### Internal media upload

`POST /api/v1/internal/feed-posts/media` accepts a multipart/form-data request with field `file`. It uses the same `x-bot-secret` header and `DISCORD_BOT_SERVICE_JWT` value. The userbot should set:

```text
TG_MEDIA_UPLOAD_URL=${BACKEND_URL}/api/v1/internal/feed-posts/media
```

Successful uploads return `{ "image_url": "/uploads/feed/<uuid>.<ext>" }`. Files are stored under `uploads/feed/` (or the configured S3 upload backend) and accept only JPEG, PNG, WebP and GIF images based on magic-byte validation. The maximum size is 10 MiB; invalid image content returns 400 and oversized content returns 413. `/posts` ingest accepts both absolute `http(s)` image URLs and stored `/uploads/...` paths.

### EForum mirroring

The eforum tracker mirrors newly detected tracked-author posts into source `EFORUM`, with external key `eforum:<post id>`, plain text, extracted images and `author_name`. Mirroring is guarded so failures do not break tracking. It is enabled by default and can be disabled with:

```text
EFORUM_FEED_MIRROR=false
```

## EForum parser and API

The tracker reads Flarum JSON:API from `https://forum.exbo.net/api` (`/posts?filter[author]=…&filter[type]=comment&sort=-createdAt`, `/posts/:id`, `/users/:id`, `/users/:slug?bySlug=1`).

The parser builds a small DOM from `contentHtml` instead of stripping tags with regexes. It keeps the original order of paragraphs, quotes and answers, so `blocks` is an ordered list of `{ kind: "quote" | "text" }` items. Quotes carry the author taken from the `href` of the `PostMention` anchor (the anchor text is a display name and may be stale), the quoted post link and id. A `PostMention` outside a quote is treated as a reply to that post, and the original post is fetched once to fill in a quote that is missing in the markup.

Supported markup: paragraphs, `<br>`, nested lists, spoilers (`class="spoiler"` → `<tg-spoiler>`), emoji images, strikethrough, inline code, YouTube/VK/Rutube/Vimeo/Twitch/TikTok embeds, upload images (rendered as `фото` links), post and user mentions. Scripts, styles and `javascript:` links are dropped.

Avatars come from `included[].attributes.avatarUrl` for `type: "users"`; when the field is absent the parser falls back to `/users/:id` and `/users/:slug?bySlug=1`. User lookups are cached in-process for 10 minutes (max 2000 entries) and resolved with `Promise.all` per post.

Response shape is unchanged except for added fields:

- `author` — `{ name, displayName, profileUrl, avatarUrl }`
- `discussion` — `{ slug, title, postNumber }`
- `blocks` — ordered rendering blocks, each with its own `html` and `text`
- `quotes[]` — `{ author, authorDisplayName, authorUrl, authorAvatarUrl, link, postId, html, text }`

`GET /api/v1/eforum/authors` resolves avatars and display names for all tracked authors.

## Post sources

`PostSource` values are `USER`, `EXBO_TG`, `STALZONE_REPORT`, `OFFICIAL_MEDIA` and `EFORUM`.

## Tier-list generator UNO filtering

The system tier-list generator reads the `uno` boolean from the sc-db listing JSON and excludes `uno: true` weapons and ammunition from generated tier lists.
