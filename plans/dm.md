# План: личные сообщения (DM)

## Контекст

Личные сообщения между зарегистрированными пользователями. WebSocket-инфраструктуры в бэкенде нет, realtime для комиссий сейчас сделан polling'ом (3 сек, `src/views/commissions/components/CommissionChat.tsx`). Решено: делаем общий WebSocket-слой и сразу переводим на него и DM, и чат комиссий.

Что уже есть и переиспользуется:

- Auth: cookie-сессии, `requireAuth` кладёт `store.authUserId` / `store.authSessionId` (`src/utils/auth.guard.ts:163-214`). Access token живёт 5 минут, refresh — 30 дней, сессия хранится в таблице `Sessions`.
- ordered-сообщения с `after`/`before` — паттерн `CommissionMessage` (`src/app/api/commissions/index.ts:174-206`).
- Пользовательские уведомления — таблица `Notifications` + unread count/read API (`src/app/api/admin/notifications/`).
- Анти-спам/XSS: `rejectOnXss`, `enforceContentSpam`, глобальный rate-limit/auto-ban в `src/index.ts`.
- Чат-UI в комиссиях: пузыри, группировка по датам, read markers, "новые сообщения" — `src/views/commissions/components/CommissionChat.tsx`, `ChatMessage.tsx`.
- Валидация: TypeBox (`t.*` из elysia), стиль `src/app/api/builds/index.ts`.

## Часть 1. WebSocket-инфраструктура (общая)

### Сервер

- Elysia поддерживает `app.ws(...)` — новый файл `src/app/ws/index.ts`, регистрируется в `src/app/index.ts` / `src/index.ts` рядом с `.use(routes)`.
- Путь: `/api/v1/ws`.
- Auth при upgrade: из cookie `access_token` (или `refresh_token`, т.к. access живёт 5 минут) вытаскиваем `sid` и проверяем сессию в БД (не отозвана, юзер не забанен) — логика повторяет `requireAuth`, но без JWT-сроков. Повторная проверка `revoked` при каждом сообщении — дешёвый select по сессии с кэшем на соединение.
- Комнаты:
  - `user:{user_id}` — персональный канал (новые DM, уведомления о лайках/комментах — см. plans/feed.md);
  - `conversation:{conversation_id}` — чат конкретной беседы (только участники);
  - `commission:{order_id}` — чат заказа комиссии (участники заказа).
- Heartbeat: ping/pong каждые ~30 c, закрытие соединения по таймауту.
- Реестр соединений в памяти: `Map<userId, Set<ws>>` (несколько вкладок/устройств). Нужен аккуратный cleanup на close.
- Лимиты: размер текста сообщения (например 4000 символов), rate limit на отправку сообщений (переиспользовать `enforceContentSpam`-логику), ограничение частоты subscribe-сообщений.
- Замечание: если в проде бэкенд за несколькими инстансами, реестр в памяти не подойдёт — понадобится pub/sub (Redis/PG LISTEN-NOTIFY). Сейчас один инстанс — фиксируем это как ограничение и пункт для будущего.

### Протокол (JSON)

```
клиент → сервер:
  { op: "subscribe", room: "conversation:..." }
  { op: "unsubscribe", room: "..." }
  { op: "message.send", conversationId, content }
  { op: "message.read", conversationId, messageId }
  { op: "typing", conversationId }
сервер → клиент:
  { event: "message.new", conversationId, message }
  { event: "message.read", conversationId, userId, lastReadMessageId }
  { event: "typing", conversationId, userId }
  { event: "notification", notification }   // room user:{id}
  { event: "error", message }
```

Проверки прав: `subscribe` разрешён только на свои комнаты (`user:{me}`, свои conversation/commission — проверка членства в БД, результат кэшируется на соединение и инвалидируется при выходе из беседы).

### Миграция комиссий на WS

- В `src/app/api/commissions/` сообщения продолжают создаваться через REST (сохраняем единый путь записи и валидацию), но сервер после записи публикует событие `message.new` в комнату `commission:{order_id}`.
- Фронт: `CommissionChat.tsx` — polling каждые 3 сек заменяется на WS-подписку; REST `after`-запрос остаётся как fallback/dogva при обрыве соединения (reconnect + дозагрузка пропущенного по `after`).
- Аккуратно: сохраняем read markers и «новые сообщения» — они просто переносятся на события.

## Часть 2. Модель данных (Prisma)

Новая миграция `prisma/migrations/YYYYMMDDHHMMSS_add_direct_messages`:

```prisma
model Conversation {
  id              String   @id @default(cuid())
  created_at      DateTime @default(now())
  last_message_at DateTime?
  messages        Message[]
  members         ConversationMember[]

  @@map("conversations")
}

model ConversationMember {
  conversation_id      String
  user_id              String
  last_read_message_id String?
  joined_at            DateTime @default(now())

  conversation Conversation @relation(...)
  user         User         @relation(...)

  @@id([conversation_id, user_id])
  @@index([user_id])
  @@map("conversation_members")
}

model Message {
  id             String   @id @default(cuid())
  conversation_id String
  author_id      String
  content        String   @db.Text
  attachments    Json?    // [{ url, mime, size }] — за файлы пока не берёмся, но поле оставить
  deleted_at     DateTime?
  created_at     DateTime @default(now())

  conversation Conversation @relation(...)

  @@index([conversation_id, created_at])
  @@map("messages")
}
```

Решение: 1:1-беседы (без групповых). Уникальность пары не вводим на уровне БД — get-or-create ищет беседу по двум членам; при гонке создаются две беседы (приемлемо), либо позже добавим материализованное `pair_key = min(uid)+'_'+max(uid)`.

## Часть 3. Бэкенд: REST + WS

Новая группа `src/app/api/messages/` (`index.ts` + `messages.service.ts`), подключить в `src/app/api/index.ts`. Все роуты за `requireAuth`.

- `GET /api/v1/messages/conversations` — список бесед пользователя: собеседник (id, username, avatar), последнее сообщение, `unread_count`, сортировка по `last_message_at` desc. Пагинация offset (`page`/`take`, как в builds).
- `POST /api/v1/messages/conversations` — `{ user_id }`: get-or-create 1:1 беседы. Проверки: цель существует, не забанена, не заблокирована (см. ниже), нет бана у меня.
- `GET /api/v1/messages/conversations/:id/messages?before=&after=&take=` — курсорная пагинация по id (паттерн commissions). Отдаёт также своих и чужих `last_read_message_id` для read markers.
- `POST /api/v1/messages/conversations/:id/messages` — `{ content }`: участник, не забанен, анти-спам/XSS, запись в БД, обновление `Conversation.last_message_at`, публикация в WS комнату `conversation:{id}` + событие `notification` в комнаты участников (кроме автора), запись в `Notifications` (в БД).
- `POST /api/v1/messages/conversations/:id/read` — `{ message_id }`: обновить `last_read_message_id` участника, broadcast `message.read`.
- Модерация (админ, permission `user:manage` — стиль `requireAdmin` из `src/utils/auth.guard.ts`): `GET /api/v1/messages/conversations/:id` (полный просмотр), возможность пометить сообщение `deleted_at` (soft delete; в чате показывать «сообщение удалено»).

Блокировки (минимально, включить в ту же миграцию):

```prisma
model UserBlock {
  blocker_id String
  blocked_id String
  created_at DateTime @default(now())
  @@id([blocker_id, blocked_id])
  @@map("user_blocks")
}
```

- REST: `POST /api/v1/messages/blocks { user_id }`, `DELETE /api/v1/messages/blocks/:userId`, `GET /api/v1/messages/blocks`.
- Проверка в `POST /conversations` и при отправке сообщения: инициатор не в блок-листе получателя.

## Часть 4. Фронтенд

- Типы/сервис/queries по конвенции: `src/types/messages.type.ts`, `src/services/messages/messages.service.ts`, `src/queries/messages/messages.queries.ts` (Axios-клиент `src/app/api/interceptors/root.interceptor.ts`, cookie-сессии — токены руками не храним).
- WS-клиент: `src/lib/ws.ts` — singleton-подключение к `/api/v1/ws` с cookie-сессией, авто-reconnect с backoff, очередь подписок после reconnect, менеджер комнат. События прокидываются в React Query (`invalidate`/`setQueryData`) и в Zustand-стор непрочитанных.
- Страницы:
  - `src/app/messages/page.tsx` — список бесед (аватар, ник, последнее сообщение, бейдж непрочитанных);
  - `src/app/messages/[id]/page.tsx` — чат: переиспользовать визуальные паттерны `CommissionChat`/`ChatMessage` (пузыри, группировка по датам, read markers, кнопка «вниз»), но на WS-событиях; отправка optimistic + подтверждение с сервера (по `message.new` с client_msg_id).
- Индикатор непрочитанных в навигации: `src/shared/layouts/nav/*` — подписка на `user:{id}`-комнату для бейджа «сообщения».
- Локализация: ключи `messages.*` во всех 5 локалях (`src/locales/*.json`), русский — основной.
- Блокировка: кнопка «заблокировать пользователя» в чате/профиле (`/users/[id]`).

## Часть 5. Документация и тесты

- `docs/messages.md` в стиле `docs/auction.md` (описание WS-протокола отдельно в разделе).
- Тесты в `tests/` по существующим конвенциям (bun test + `e2e/server.ts`): get-or-create беседы, права доступа к беседе (неучастник = 403/404), курсорная пагинация, блокировки, soft delete, read counters. WS-протокол — интеграционный smoke-тест (upgrade, подписка, доставка события).

## Порядок работ

1. WS-инфраструктура (сервер + `src/lib/ws.ts` на фронте) без бизнес-логики.
2. Prisma-миграция + REST + сервисы.
3. Страницы DM на WS.
4. Перевод CommissionChat на WS (fallback на REST).
5. Блокировки, модерация админом, доки, тесты.

## Допущения (проверить с владельцем при реализации)

- Групповых чатов нет — только 1:1.
- Файлы/стикеры в сообщениях — вне скоупа первой версии (поле `attachments` зарезервировано).
- Отправка через WS и через REST возможна; фронт использует WS с REST-fallback.
