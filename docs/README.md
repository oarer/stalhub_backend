# StalHub API — документация

**Документация REST API бэкенда StalHub (Elysia + Bun). Описаны эндпоинты, схемы запросов/ответов и общие правила API.**

---

## Оглавление

- [mainRoute.md](mainRoute.md) — корневые и общие эндпоинты
- [auth.md](auth.md) — авторизация (пароль, refresh, OAuth EXBO/Discord/Telegram)
- [internal.md](internal.md) — внутренний API (Discord-бот сервис)
- [users.md](users.md) — пользователи
- [articles.md](articles.md) — статьи
- [arts.md](arts.md) — рисунки
- [tier-lists.md](tier-lists.md) — тир-листы
- [builds.md](builds.md) — сборки
- [attachments.md](attachments.md) — обвесы на оружие
- [authors.md](authors.md) — авторы контента
- [player.md](player.md) — профиль игрока
- [balance.md](balance.md) — баланс
- [artifacts.md](artifacts.md) — артефакты
- [upgrade-prices.md](upgrade-prices.md) — цены апгрейда
- [hideout.md](hideout.md) — ангар
- [server-online.md](server-online.md) — онлайн серверов
- [arsenal.md](arsenal.md) — арсенал
- [exbo.md](exbo.md) — API EXBO
- [loadout.md](loadout.md) — амуниция игрока
- [barter.md](barter.md) — бартер
- [auction.md](auction.md) — аукцион
- [loot.md](loot.md) — лут
- [metrics.md](metrics.md) — метрики
- [clan.md](clan.md) — кланы
- [admin.md](admin.md) — административный API

---

## Глобально

### Базовый путь

Все API-группы в коде объявлены без префикса и монтируются под общим префиксом **`/api/v1`**. То есть эндпоинт, описанный как `POST /auth/login`, по факту доступен по адресу `POST /api/v1/auth/login`. Исключение — корневой эндпоинт `GET /` и статика `/uploads/*`, которые объявлены вне группы.

### Swagger

Интерактивная документация доступна по адресу `/swagger` (плагин `@elysiajs/swagger`). Группы эндпоинтов размечены тегами `Auth`, `Auth: Exbo`, `Auth: Discord`, `Auth: Telegram`, `Internal` и др.

### Куки и JWT

Авторизация построена на двух куки, которые выставляет сервер:

| Кука | TTL | `httpOnly` | Назначение |
| ---- | --- | ---------- | ---------- |
| `access_token` | 5 минут | **false** — намеренно читается клиентским JS | основной токен доступа |
| `refresh_token` | 30 дней | true | перевыпуск пары токенов |

Обе куки: `sameSite=lax`, `path=/`, `secure` только в production (`NODE_ENV=production`). Кука `refresh_token` для `/auth/refresh` обязательна, `access_token` — опциональна.

**JWT-claims** (payload access-token):

| Claim | Описание |
| ----- | -------- |
| `sub` | id пользователя (строка) |
| `sid` | id сессии (строковый UUID) |
| `name` | имя пользователя |
| `username` | логин пользователя |
| `role` | массив названий ролей |
| `exp` | unixtime истечения |

Refresh-токен несёт только `sub`, `sid`, `exp`. Проверка сессии идёт по `sid`: сессия должна существовать и не быть отозванной (`revoked`).

### Гуарды авторизации

| Гуард | Требование | Примечание |
| ----- | ---------- | ---------- |
| `requireAuth` | валидный `access_token` | Проверяет подпись, `sub` + `sid`, что сессия существует и не отозвана, что пользователь не забанен. Также ограничивает гостей (`clan_guest`) префиксами `/api/v1/auth/`, `/api/v1/clan/`, `/api/v1/users/@me`, `/api/v1/health`. |
| `requireOptionalAuth` | опционально | Если токен валиден — заполняет `user_id`, иначе анонимно. Просроченные/отозванные сессии терпимы. |
| `requireAdmin` | роль с правом `user:manage` | Иначе **403** `{ "error": "Forbidden" }`. Проверка права идёт в БД на каждый запрос, без кэша. |
| `requireRefreshAuth` | только refresh-кука | Проверяет только подпись (без отозванности сессии и бана); используется в refresh-флоу. |
| `x-bot-secret` | заголовок равен `DISCORD_BOT_SERVICE_JWT` | Для внутреннего API (`/internal/*`). |

### RPS-лимит на глобальном хуке

Глобальный `onRequest`-хук для каждого запроса фиксирует время начала и до обработки роута проверяет лимит запросов в секунду:

- Счётчик работает по ключу `rps:<normalizedRoute>:<ip>:<текущая секунда>` в Redis, окно 3 секунды.
- Порог — `RPS_THRESHOLD` (по умолчанию `999`, т.е. фактически отключено). `RPS_THRESHOLD <= 0` — лимит не применяется.
- IP определяется через заголовки `x-forwarded-for` (первое значение) → `x-real-ip` → адрес сокета.
- Превышение порога блокирует IP (`blockIp`).
- Заблокированный IP получает **429** `{ "error": "Too many requests, try again later" }`.
- **Исключены из RPS** (префикс-матчинг в `shouldSkipRps`): `/api/v1/health`, `/api/v1/metrics`, `/uploads/`, `/swagger`.

### Авто-бан

Двухстадийная защита от злоупотреблений, Redis-бэкенд, уведомления админам в Discord. Правила нарушений: `request_abuse` и `content_spam`.

- **Логин-фейлы** — на каждую неудачную попытку `/auth/login` инкрементируется счётчик `login-fail:<username>:<ip>` (окно 10 минут). После превышения `LOGIN_MAX_FAILURES` IP блокируется с причиной `login bruteforce (<username>)`. Успешный вход очищает счётчик.
- **Спам контента** — лимиты на создание контента в час (`enforceContentSpam`): `SPAM_LIMIT_COMMENT = 5`, `SPAM_LIMIT_BUILD = 10`, `SPAM_LIMIT_ARTICLE = 10`, `SPAM_LIMIT_ART = 10`. При достижении лимита счётчик сбрасывается в `0`, и запускается машина состояний нарушений.
- **Машина состояний** — первое нарушение → предупреждение (`auto_warned`), второе → перманентный бан (`auto_banned` + `banned`). Повтор после бана — no-op. Пользователи, чей максимальный ранг роли `>= AUTO_BAN_SKIP_RANK`, не наказываются автоматически (вместо этого шлётся алерт на ручную проверку). Причина бана: «Аккаунт заблокирован, пока мы проводим расследование. Обратитесь в службу поддержки».
- **Блокировка IP** — временная, экспоненциальная: `IP_BLOCK_MIN_SECONDS * 2^(hits-1)`, максимум `IP_BLOCK_MAX_SECONDS`. Счётчик нарушений живёт 7 дней. Redis-ключи: `ip-block:*`, `ip-block-hits:*`.
- **Fail-open** — любая ошибка Redis делает проверки пропущенными (`isIpBlocked` возвращает `false`).

### Авторизация в маршрутах

В документации каждого файла используется пометка об авторизации:

- `requireAuth` — нужен валидный `access_token`;
- `requireOptionalAuth` — опционально;
- `requireAdmin` — роль с правом `user:manage`;
- `requireRefreshAuth` — только refresh-кука;
- `x-bot-secret` — заголовок `x-bot-secret`.

---