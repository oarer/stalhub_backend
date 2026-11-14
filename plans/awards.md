# План: голосование «Премия года» (несколько категорий)

## Контекст

Админ создаёт кампанию премии с категориями и списком номинантов. Номинант — не пользователь сайта: админ вручную заполняет его профиль (аватар, ссылки на соцсети, ник). Любой зарегистрированный юзер отдаёт один голос в каждой категории; свой голос можно переголосовать (изменить). Итоги открываются по завершении кампании.

Что уже есть:

- RBAC: permission-модель `User → Role → Permission`, `requirePermission` / `requireAdmin` (= `user:manage`) в `src/utils/auth.guard.ts:29-160`. Админ-группа роутов `src/app/api/admin/` с паттерном `index.ts` + `*.service.ts`.
- Админ-фронт: `src/app/admin/**`, `src/views/admin/`.
- Uploads: `src/lib/uploads.ts` (FS/S3, `putUpload`/`deleteUpload`), раздача `/uploads/*` в `src/index.ts:85-157`; папка `uploads/users/` — для аватарок.
- Rate limiting/auto-ban глобальный (`src/index.ts`).
- Уведомления: `Notifications` (+ WS-событие `notification`, см. plans/dm.md) — для анонса старта голосования и публикации результатов.
- Фронт: React Query (`src/queries/**`), страницы в `src/app/(public)/`, локали `src/locales/*.json` (5 шт., русский основной).

## Часть 1. Модель данных

Миграция `prisma/migrations/YYYYMMDDHHMMSS_add_awards`:

```prisma
model AwardCampaign {
  id        String   @id @default(cuid())
  year      Int      @unique        // премия года — одна кампания на год
  title     String
  status    String   @default("draft")   // draft | voting | closed
  ends_at   DateTime?   // дедлайн голосования; автозакрытие по cron
  results_published_at DateTime?
  categories AwardCategory[]
  @@map("award_campaigns")
}

model AwardCategory {
  id          String @id @default(cuid())
  campaign_id String
  title       String
  description String?
  position    Int    @default(0)
  campaign    AwardCampaign @relation(...)
  nominees    AwardNominee[]
  votes       AwardVote[]
  @@index([campaign_id, position])
  @@map("award_categories")
}

model AwardNominee {
  id           String  @id @default(cuid())
  category_id  String
  name         String       // ник
  avatar_url   String?
  social_links Json?        // [{ label, url }]
  description  String?
  position     Int          @default(0)
  category     AwardCategory @relation(...)

  @@index([category_id, position])
  @@map("award_nominees")
}

model AwardVote {
  id          String @id @default(cuid())
  category_id String
  user_id     String
  nominee_id  String
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@unique([category_id, user_id])   // один голос юзера в категории, переголосование = update
  @@index([nominee_id])
  @@map("award_votes")
}
```

Примечания:
- один голос за человека — трактуем как «один голос на пользователя в категории»; если нужно строго «один голос на всю кампанию», поменять unique на `[campaign_id, user_id]` (уточнить при реализации; по умолчанию — на категорию).
- номинант привязан к категории; если один человек номинирован в нескольких категориях — создать отдельные записи (без дедупликации, проще).

## Часть 2. Бэкенд — админ

`src/app/api/admin/awards/` (`index.ts` + `awards.service.ts`), всё за `requirePermission('awards:manage')` (создать permission и повесить на админ-роль через существующий `src/app/api/admin/permissions/`; либо временно `user:manage` — решить при реализации).

- `GET /api/v1/admin/awards` — кампании со вложенными категориями/номинантами.
- `POST /api/v1/admin/awards` — создать кампанию `{ year, title }`.
- `PATCH /api/v1/admin/awards/:id` — `{ title, status, ends_at }`. Переходы статуса: `draft → voting → closed`; закрытие происходит по дедлайну автоматически либо вручную админом; `closed` фиксирует `results_published_at` при публикации результатов (см. ниже — «закрыто» ≠ «опубликовано»).
- `POST /api/v1/admin/awards/:campaignId/categories` / `PATCH .../categories/:id` / `DELETE ...` — CRUD категорий (удаление запрещено, если есть голоса; либо каскад с предупреждением).
- CRUD номинантов: `POST/PATCH/DELETE /api/v1/admin/awards/:campaignId/categories/:categoryId/nominees/:id?`.
- Аватарка номинанта: `POST /api/v1/admin/awards/nominees/avatar` (multipart, `t.File`) — сжатие/resize как у аватарок юзеров (`src/app/api/users/avatar.ts`), сохранение в `uploads/users/awards/`, ответ `{ url }`. Валидация mime по фактическим байтам.
- `GET /api/v1/admin/awards/:id/results` — счётчики голосов по номинантам (в любой момент; для юзеров — только после publish).

## Часть 3. Бэкенд — публичное API

`src/app/api/awards/` (`index.ts` + `awards.service.ts`), подключить в `src/app/api/index.ts`.

- `GET /api/v1/awards` — активная кампания (`status = voting`) со категориями, номинантами и (для авторизованного) его текущими голосами: `{ categories: [{ ..., nominees: [...], my_vote_nominee_id }] }`. Draft/closed кампании — 404 (или 200 с `status: closed` только после publish результатов).
- `PUT /api/v1/awards/vote` — `{ category_id, nominee_id }` за `requireAuth`: upsert (переголосование). Проверки: кампания в статусе `voting` и дедлайн не прошёл; номинант принадлежит категории; юзер не забанен; **юзер не голосует за себя** (если nominee соответствует аккаунту юзера — 400). Rate limit на переголосования (анти-флуд).
- `DELETE /api/v1/awards/vote/:categoryId` — забрать голос (решить, разрешено ли; по умолчанию да).
- `GET /api/v1/awards/results` — после `results_published_at`: `{ categories: [{ ..., nominees: [..., votes_count] }] }` + победитель (max votes; при ничьей — оба/никакой, показать «ничья»).

Авто-закрытие по дедлайну: cron-задача (`@elysia/cron`, есть в проекте — см. `src/crons.ts`) раз в час переводит кампании с истёкшим `ends_at` из `voting` в `closed` и шлёт уведомление «голосование завершено, ждите итогов». Результаты по-прежнему публикует админ вручную.

Скрытие промежуточных итогов: во время голосования `votes_count` юзерам не показываем (только админу через admin-роут) — предупреждение о «стакинге» не нужно, но и интрига сохраняется.

## Часть 4. Фронтенд

- Типы/сервис/queries: `src/types/awards.type.ts`, `src/services/awards/awards.service.ts`, `src/queries/awards/awards.queries.ts`.
- Публичная страница `src/app/(public)/awards/page.tsx` + view `src/views/awards/`:
  - кампания: заголовок, год, таймер до конца голосования (по `ends_at`);
  - категории — табы или секции (Tabs из `src/components/ui/`);
  - карточка номинанта: аватар, ник, описание, иконки соцсетей (Iconify), кнопка «Голосовать»; у проголосованного — подсветка выбранного и кнопка «переголосовать»; голосовать за себя нельзя (кнопка заблокирована с подсказкой); после дедлайна голосование недоступно, ждём итогов;
  - после publish — вкладка «Итоги» с барами голосов и победителями.
- Админка: `src/app/admin/awards/page.tsx` + view `src/views/admin/awards/`:
  - управление кампанией (статусы, дедлайн голосования, кнопки «открыть голосование» / «закрыть» / «опубликовать результаты»);
  - CRUD категорий и номинантов (диалоги на компонентах `src/components/ui/`), загрузка аватарки (паттерн `src/views/me/components/settings/ImageEditorModal.tsx` / upload-модалок статей), редактируемые ссылки на соцсети (label + url);
  - мини-таблица текущих результатов для админа.
- Анонсы: при `draft → voting` и `voting → closed` — глобальное уведомление через существующий механизм `src/app/api/admin/notifications/` (+ WS `notification`).
- Локализация: ключи `awards.*` во всех 5 локалях.

## Часть 5. Документация и тесты

- `docs/awards.md` в стиле остальных доков.
- Тесты в `tests/`: CRUD кампании/категорий/номинантов (права), upsert голоса + unique-ограничение, голосование в draft/closed и после дедлайна = ошибка, номинант чужой категории = ошибка, голос за себя = ошибка, скрытие/публикация результатов, переголосование меняет счётчики, cron автозакрытия по `ends_at`.

## Порядок работ

1. Миграция + админ-API + permission `awards:manage`.
2. Публичное API (голосование).
3. Публичная страница и голосование.
4. Админка (CRUD, аватарки, статусы, результаты).
5. Уведомления-анонсы, доки, тесты.

## Допущения

- Голос — один на пользователя **в каждой категории** (переголосование разрешено). Если нужен «один голос на кампанию» — поменять unique-ключ.
- Дедлайн: админ задаёт дату окончания; cron по истечении автоматически закрывает голосование (итоги публикует админ вручную). Ручное закрытие админом также доступно.
- Голосовать за себя нельзя (номинант, совпадающий с аккаунтом голосующего).
- Авто-подтягивание пользователей-номинантов из сайта не делаем: номинант — «внешний» человек по описанию админа. Но если ник совпадает с юзером сайта, можно подсветить это на фронте (nice-to-have) — это же используется для проверки «за себя голосовать нельзя».
