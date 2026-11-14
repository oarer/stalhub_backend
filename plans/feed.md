# План: лента постов (сборки + тир-листы) с лайками, комментариями и шерингом

## Контекст

Единая лента из пользовательских `Post` и существующего публичного контента: `Build` (сборки игроков), `TierList` (тир-листы) и `Art` (работы художников). Посты — отдельная сущность для коротких текстовых публикаций; детальные страницы существующих моделей остаются как есть. В ленте можно лайкнуть пост, оставить комментарий и поделиться ссылкой; шеринг должен выглядеть как у fixupx.com — расширенные OpenGraph-карточки при репосте ссылки на Discord/Telegram/X.

Что уже есть:

- `Build` — CRUD + листинг с offset-пагинацией (`src/app/api/builds/`, service: `src/app/api/builds/builds.service.ts:347-392`).
- `TierList` — публичные тир-листы (`src/app/api/tier-lists/`).
- Лайки: полиморфная таблица `Star` с `@@unique([target_type, target_id, user_id])` и enum `StarTargetType { BUILD, ARTICLE, ART, TIER_LIST, POST }` (`prisma/schema.prisma`). Фронт-паттерн: `stars_count` + `is_starred`, кнопка в `src/views/articles/ArticleView.tsx:54-66`.
- Комментарии: полиморфный паттерн `ArticleComment` (article/art/profile) с вложенными ответами, XSS-фильтром, спам-лимитами, mentions и уведомлениями (`src/app/api/articles/comments/`). Фронт: переиспользуемые `src/components/comments/CommentThread.tsx` / `CommentForm.tsx`.
- OG: на фронте уже есть серверная генерация PNG-обложек через `src/app/api/og/[id]/route.tsx` (`@resvg/resvg-js`) и динамический `generateMetadata` для статей (`src/app/(public)/articles/[id]/page.tsx:22-75`). Тир-листы используют статическую OG-картинку.

## Часть 1. Модель данных

Миграции `prisma/migrations/YYYYMMDDHHMMSS_add_feed_likes` и `YYYYMMDDHHMMSS_add_posts`:

1. Добавить модель `Post` (`posts`) с nullable title, content, автором, counters и timestamps. Посты публикуются сразу, без модерации; создание защищено глобальным rate-limit/auto-ban и `enforceContentSpam`.
2. Расширить enum `StarTargetType` значениями `TIER_LIST` и `POST` (лайк по сути тот же «star», отдельная таблица `Like` не нужна — уже есть уникальность и счётчики).

   ⚠️ Обратить внимание: enum расширять надо аккуратно (Postgres `ALTER TYPE ... ADD VALUE` — отдельная миграция SQL, не `prisma migrate dev`-generated, если Prisma её не сгенерирует корректно).

3. Счётчики для быстрой ленты: `stars_count`/`comments_count` на `Build`, `TierList` и `Post`; для `Art` используются существующие polymorphic star/comment записи. Денormalized counters инкрементируются транзакционно вместе с созданием/удалением.

Комментарии: расширить существующий полиморфный комментарий до таргетов `BUILD`, `TIER_LIST` и `POST` (переиспользуем XSS/спам/mentions/уведомления «как есть»), а не заводить новую таблицу `FeedComment`.

## Часть 2. Бэкенд

Новая группа `src/app/api/feed/` (`index.ts` + `feed.service.ts`), подключить в `src/app/api/index.ts`.

- `GET /api/v1/feed?type=all|build|tier_list|post|art&page=&take=&sort=new|top` — публичный (с `requireOptionalAuth` для `is_starred`). В `all` объединяются публичные `Build`, `TierList`, `Post` и `Art`; `sort=top` использует окно 28 дней и `stars_count desc`.
- Ответ: `{ data: FeedItem[], total_count, page, take }`, где `FeedItem` имеет type `build|tier_list|post|art`, counters, `is_starred` и соответствующее поле `build|tier_list|post|art`.
- `POST /api/v1/posts`, `GET/PATCH/DELETE /api/v1/posts/:id` — посты публикуются сразу; редактирование и удаление доступны автору (администраторская проверка допускается).
- `POST/DELETE /api/v1/posts/:id/star` — stars для постов.
- Комментарии: полиморфные targets `BUILD`/`TIER_LIST`/`POST` с общей XSS/спам/mentions/уведомления логикой.
- Rate limiting: комментарии, stars и создание постов под глобальным auto-ban/rate-limit (`src/index.ts`) + `enforceContentSpam`.
- Post v2: `image_urls`, `PostSource`, `external_key`, author fallback, build/tier-list attachments, repost attribution and single/multiple-choice polls with transactional vote replacement.
- `POST /api/v1/internal/feed-posts` принимает auto-posts от userbot с тем же `x-bot-secret`, что и internal bot routes; EForum mirroring управляется `EFORUM_FEED_MIRROR` (default on).
- Builds and tier-lists expose author-only `hide-from-feed` toggles; the feed excludes hidden items.

## Часть 3. Фронтенд

- Типы/сервис/queries: `src/types/feed.type.ts`, `src/services/feed/feed.service.ts`, `src/queries/feed/feed.queries.ts` (infinite query, конвенция `PaginatedResponse<T>`).
- Страница `src/app/(public)/feed/page.tsx` + view `src/views/feed/`:
  - infinite scroll (useInfiniteQuery), фильтры «все / сборки / тир-листы», сортировка;
  - карточка поста: превью (скрин сборки / картинка тир-листа), автор (hover-card), заголовок, кнопка лайка (по паттерну ArticleView), счётчик комментариев, кнопка «поделиться» (CopyButton из `src/components/ui/CopyButton.tsx` + `navigator.share`, где доступен);
  - блок комментариев inline (развёрнутый) или переход на детальную страницу — при реализации предпочесть inline-развёртку c `CommentThread.tsx`.
- Детальные страницы уже существуют (`/builds/[id]`, `/tierlists/[id]`) — добавить туда кнопку «поделиться» и CommentThread для таргетов build/tier_list (компонент уже generic).
- Локализация: ключи `feed.*` во всех 5 локалях.

## Часть 4. OpenGraph «как в fixupx»

Цель: при репосте `stalhub.ru/builds/123` или `stalhub.ru/tierlists/45` в Discord/Telegram/X карточка выглядит как embed твита у fixupx: большая картинка, автор (аватар + ник), название, описание, счётчики, кнопочные CTA в описании.

Работы во фронтенде (Next.js):

1. Динамическая OG-картинка для каждого типа поста:
   - новый генератор картинок по образцу `src/app/api/og/[id]/route.tsx`: `src/app/api/og/build/[id]/route.tsx` и `src/app/api/og/tierlist/[id]/route.tsx` (или один параметризованный роут `src/app/api/og/post/[type]/[id]/route.tsx`);
   - раскладка в стиле fixupx: слева/сверху контент-превью, снизу полоса с аватаром автора, ником, названием, счётчиками (лайки, комментарии), домен сайта. Компонент разметки — по аналогии с `src/lib/blog-cover.ts`.
2. `generateMetadata` на страницах:
   - `src/app/(public)/builds/[id]/page.tsx` и `src/app/(public)/tierlists/[id]/page.tsx`: полные `og:title/description/image/url/type`, `twitter:card=summary_large_image`, `twitter:image`, canonical;
   - `description` составить из названия + описания + счётчиков («★ 128 · 💬 34 · от @username»).
3. Проверить, что `/uploads/*`-картинки, попавшие в `og:image`, доступны без auth и отдают корректный `content-type` (бэкенд `src/index.ts:85-157` уже раздаёт их с CSP — проверить, что не мешает crawler'ам Discord/Telegram; при необходимости для ботов отдавать без sandbox-ограничений).
4. `next/image`-превью в карточке ленты ссылается на те же источники.

Telegram/Discord сами читают OG — отдельный unfurl-сервис не нужен. Если позже понадобится превью внешних ссылок внутри постов — отдельный сервис с allowlist/SSRF-защитой (готового нет; вне скоупа этого плана).

## Часть 5. Документация и тесты

- `docs/feed.md` (эндпоинт ленты, расширение звёзд/комментариев).
- Тесты в `tests/`: лента — пагинация, фильтр по типу, сортировка, `is_starred` для анонима/авторизованного; звёзды/комментарии на новых таргетах — уникальность, права, счётчики, уведомления.

## Порядок работ

1. Миграция (enum + счётчики) и расширение звёзд/комментариев.
2. GET /feed + сервис.
3. Страница ленты + карточки.
4. Комментарии/лайки в карточках и детальных страницах.
5. OG-картинки + metadata, проверка реальными репостами (Discord dev-сервер, Telegram).

## Допущения

- «Поделиться» = богатая OG-карточка наших страниц при шеринговых репостах (fixupx-стиль). Превью произвольных внешних ссылок внутри постов не делаем.
- В ленту попадает только публичный/опубликованный контент (по текущим правилам видимости Build/TierList — уточнить поля публикации при реализации).
- Лайк = существующий «star», термин «лайк» — на фронте.
