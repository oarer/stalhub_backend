# Авторизация

**Вход по паролю, перевыпуск токенов и OAuth-провайдеры (EXBO, Discord, Telegram). Все маршруты группы живут под префиксом `/api/v1/auth/...`. Подробности о куках, JWT-claims и авто-бане — в README → «Глобально».**

---

## Общие сведения

- Оба токена подписываются одним `jwt`-плагином (`JWT_SECRET`).
- Каждый успешный вход создаёт новую строку сессии (`createSession`); `userAgent` усекается до 500 символов, `ip` — до 45.
- Новые пользователи через OAuth регистрируются с дефолтной ролью `user` (`assignDefaultRole`, роль upsert'ится глобально, вызов безопасен повторно).
- Попытки входа/линковки OAuth-аккаунта, уже привязанного к другому пользователю, отвечают **409**.
- Линковка провайдеров (кроме Telegram `POST /callback`) ведётся через одноразовые in-memory state-токены (`createLinkState`/`consumeLinkState`, живут 10 минут, только один процесс) — для нескольких инстансов нужна привязка пользователя к одному инстансу.

---

## `POST /api/v1/auth/login`
Вход по username/password.

Логин ищется **case-insensitive** (`mode: 'insensitive'`). Проверяется scrypt-хэш пароля. Каждая неудача записывается в счётчик `login-fail:<username>:<ip>` (окно 10 минут); после превышения `LOGIN_MAX_FAILURES` IP блокируется. Уже заблокированный IP отклоняется до любых проверок.

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `username` | логин, `minLength: 1` | `string` | Да |
| `password` | пароль, `minLength: 1` | `string` | Да |

### Тело ответа
```json
{ "success": true }
```

Успех выставляет обе куки: `access_token` (5 минут, `httpOnly: false`) и `refresh_token` (30 дней, `httpOnly: true`).

### Возможные ошибки
- **401** — `{ "error": "Invalid username or password" }` — пользователь не найден или неверный пароль; фиксируется фейл логина
- **429** — `{ "error": "Too many requests, try again later" }` — IP уже заблокирован

---

## `POST /api/v1/auth/refresh`
Перевыпуск пары токенов по refresh-куке.

Проверяет: подпись токена (`jwt.verify`), наличие `sub`/`sid`, что сессия существует и не отозвана (`revoked`). Refrech-флоу **не** проверяет бан-список и RPS-блокировки сам по себе — используется только подпись и статус сессии. При любой ошибке refresh-кука удаляется и возвращается 401.

### Параметры (cookie)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `refresh_token` | refresh-токен | `string` | Да |
| `access_token` | access-токен (игнорируется) | `string` | Нет |

### Тело ответа
```json
{ "success": true }
```

Новая пара токенов с теми же `sub`/`sid` выставляется в обе куки (rolling-перевыпуск без фиксированного окна ротации).

### Возможные ошибки
- **401** — `{ "error": "Invalid refresh token" }` — невалидная подпись или нет `sub`/`sid`
- **401** — `{ "error": "Session revoked or expired" }` — сессия не найдена или отозвана

---

# OAuth: EXBO (exbo.net)

## `GET /api/v1/auth/exbo/login`
Начало OAuth-флоу EXBO для входа/регистрации.

Создаёт `eXBOAuthState` в БД (state, `expires_at` = now + 10 минут) и возвращает URL авторизации. Scope пустой, `response_type=code`.

### Тело ответа
```json
{ "url": "https://exbo.net/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=&state=..." }
```

---

## `GET /api/v1/auth/exbo/callback`
OAuth-колбэк EXBO. Обслуживает и вход/регистрацию, и линковку (если `state` — это in-memory link-токен, он потребляется первым; иначе state ищется в таблице `eXBOAuthState` и удаляется после использования).

Обменивает `code` на токены (grant `authorization_code`, эндпоинт `https://exbo.net/oauth/token`) и забирает профиль с `https://exbo.net/oauth/user`. Access-токен EXBO никогда не держится в памяти — шифруется (`encryptSecret`) и сохраняется в `eXBOAuth.token_blob` вместе с таймстемпами истечения `access_expires_at`/`refresh_expires_at`. После входа/линковки/смены региона вызывается импорт кланов игрока (`clanService.detectFromExboCharacters`) — best-effort, ошибки не блокируют авторизацию.

### Параметры (query)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `code` | OAuth-код EXBO | `string` | Да |
| `state` | OAuth-состояние (link-токен или сохранённый state) | `string` | Да |
| `region` | регион для импорта кланов (enum `Regions`) | `Regions` | Нет |

`Regions` = `RU` | `EU` | `NA` | `SEA` | `NEA`.

### Тело ответа
Вход/регистрация:
```json
{ "success": true }
```
(выставляются обе куки)

Линковка:
```json
{ "success": true, "linked": true }
```

### Возможные ошибки
- **400** — `{ "error": "Failed to exchange code", "status": <код EXBO>, "body": <текст ответа> }`
- **400** — `{ "error": "Invalid token response", "body": <текст ответа> }`
- **400** — `{ "error": "Failed to fetch user" }`
- **403** — `{ "error": "Invalid or expired state" }` — state не найден или просрочен
- **409** — `{ "error": "This EXBO account is already linked to another user" }` — при линковке: аккаунт уже привязан к другому пользователю

---

## `GET /api/v1/auth/exbo/link`
`requireAuth`. Старт линковки EXBO к текущему пользователю. Если EXBO уже привязан — возвращает `{ "error": "EXBO already linked" }`. Создаёт in-memory link-токен и строку `eXBOAuthState` (10 минут) и отдаёт URL авторизации.

### Тело ответа
```json
{ "url": "https://exbo.net/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=&state=..." }
```

### Возможные ошибки
- **200**, но с полем `error` — уже привязан (без смены статуса)
- **401** — `{ "error": "Unauthorized" }` — нет валидного `access_token`

---

## `DELETE /api/v1/auth/exbo/link`
`requireAuth`. Отвязка EXBO: удаляется только локальная строка `eXBOAuth` для пользователя, на стороне EXBO ничего не трогается.

### Тело ответа
```json
{ "success": true }
```

### Возможные ошибки
- **401** — `{ "error": "Unauthorized" }`

---

## `GET /api/v1/auth/exbo/region`
`requireAuth`. Текущий регион EXBO-аккаунта и время, когда регион можно будет сменить снова (кулдаун 7 дней, применяется только после первой смены).

### Тело ответа
```json
{
	"region": "RU",
	"region_changed_at": "2026-09-01T12:00:00.000Z",
	"can_change_at": "2026-09-08T12:00:00.000Z",
	"retry_after": 604800
}
```

### Поля ответа
| Поле | Описание | Тип |
| ---- | -------- | --- |
| `region` | текущий регион (`Regions` или `null`) | `string`/`null` |
| `region_changed_at` | время последней смены региона | `string`/`null` |
| `can_change_at` | ближайшее возможное время смены (если `region_changed_at` не задан — `null`) | `string`/`null` |
| `retry_after` | секунд до ближайшей смены (0 если можно менять) | `number` |

### Возможные ошибки
- **404** — `{ "error": "EXBO account is not linked" }`
- **401** — `{ "error": "Unauthorized" }`

---

## `PATCH /api/v1/auth/exbo/region`
`requireAuth`. Смена региона аккаунта. Одинаковый регион — no-op (возвращает текущее состояние, `region_changed_at` не меняется). Доступ к смене региона на линкованном аккаунте ограничен кулдауном 7 дней (`REGION_COOLDOWN_MS`, срабатывает только когда `region_changed_at` уже задан). После смены запускается переимпорт кланов для нового региона (best-effort).

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `region` | новый регион (enum `Regions`) | `Regions` | Да |

### Тело ответа
```json
{
	"success": true,
	"region": "EU",
	"region_changed_at": "2026-09-11T12:00:00.000Z"
}
```

### Возможные ошибки
- **404** — `{ "error": "EXBO account is not linked" }`
- **429** — `{ "error": "Region can be changed once every 7 days", "region": "RU", "can_change_at": "...", "retry_after": 12345 }` — кулдаун активен
- **401** — `{ "error": "Unauthorized" }`

---

# OAuth: Discord

## `GET /api/v1/auth/discord/login`
Начало OAuth-флоу Discord (API v10, scope `identify`) для входа/регистрации. `state` в login-флоу не отправляется вообще.

### Тело ответа
```json
{ "url": "https://discord.com/api/v10/oauth2/authorize?client_id=...&redirect_uri=...&response_type=code&scope=identify" }
```

---

## `GET /api/v1/auth/discord/callback`
OAuth-колбэк Discord. Обменивает код (`/oauth2/token`), забирает профиль `/users/@me` (id, username, `global_name`, avatar). Токены Discord **не** персистятся — сохраняется только идентичность (`discord_id`, name, username, `avatar_id`). Неизвестный `discord_id` регистрирует пользователя с ролью `user`; известный — просто создаёт новую сессию. Если `state` — link-токен, выполняется линковка к пользователю из токена.

### Параметры (query)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `code` | OAuth-код Discord | `string` | Да |
| `state` | link-токен (для линковки) | `string` | Нет |

### Тело ответа
Вход/регистрация:
```json
{ "success": true }
```
(выставляются обе куки)

Линковка:
```json
{ "success": true, "linked": true }
```

### Возможные ошибки
- **400** — `{ "error": "Failed to exchange code" }`
- **400** — `{ "error": "Failed to fetch user" }`
- **409** — `{ "error": "This Discord account is already linked to another user" }` — при линковке: аккаунт уже привязан

---

## `GET /api/v1/auth/discord/link`
`requireAuth`. Старт линковки Discord к текущему пользователю. Если уже привязан — `{ "error": "Discord already linked" }`. Создаёт in-memory link-токен и возвращает URL авторизации с ним в `state`.

### Тело ответа
```json
{ "url": "https://discord.com/api/v10/oauth2/authorize?client_id=...&redirect_uri=...&response_type=code&scope=identify&state=..." }
```

### Возможные ошибки
- **200**, но с полем `error` — уже привязан
- **401** — `{ "error": "Unauthorized" }`

---

## `DELETE /api/v1/auth/discord/link`
`requireAuth`. Отвязка Discord: удаляется только локальная строка `discordAuth` пользователя.

### Тело ответа
```json
{ "success": true }
```

### Возможные ошибки
- **401** — `{ "error": "Unauthorized" }`

---

# OAuth: Telegram

## Общие сведения

OIDC-провайдер `https://oauth.telegram.org` с PKCE (S256). Подпись `id_token` проверяется локально: `alg` строго `RS256`, ключ берётся из JWKS (`/.well-known/jwks.json`, кэшируется максимум на час), проверяются `iss`, `aud`, `exp`, `sub`. `POST /callback` — альтернативный вход без PKCE (сырой `id_token` в теле), может только входить/регистрировать, но не линковать.

---

## `GET /api/v1/auth/telegram/login`
Начало OAuth-флоу Telegram (scope `openid profile`). Генерирует PKCE-verifier/challenge (S256) и хранит verifier в in-memory `stateStore` (10 минут).

### Тело ответа
```json
{ "url": "https://oauth.telegram.org/auth?client_id=...&redirect_uri=...&response_type=code&scope=openid+profile&state=...&code_challenge=...&code_challenge_method=S256" }
```

---

## `GET /api/v1/auth/telegram/callback`
OAuth-колбэк Telegram (браузерный флоу). Потребляет `state` из in-memory `stateStore` (невалидный/просроченный → 403) и реплеит `code_verifier` в токен-эндпоинт (HTTP Basic client_id/secret). Если в state был `user_id` — выполняется линковка; иначе вход/регистрация по `telegram_id`.

### Параметры (query)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `code` | OAuth-код Telegram | `string` | Да |
| `state` | OAuth-состояние (ключ stateStore) | `string` | Да |

### Тело ответа
Вход/регистрация:
```json
{ "success": true }
```
(выставляются обе куки)

Линковка:
```json
{ "success": true, "linked": true }
```

### Возможные ошибки
- **400** — `{ "error": "Failed to exchange code" }`
- **403** — `{ "error": "Invalid or expired state" }`
- **403** — `{ "error": "Invalid id_token" }`
- **409** — `{ "error": "This Telegram account is already linked to another user" }`

---

## `POST /api/v1/auth/telegram/callback`
Вход по сырому `id_token` в теле (для не-браузерных клиентов). Не использует PKCE/state, не выполняет линковку.

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `id_token` | валидный Telegram OIDC id_token | `string` | Да |

### Тело ответа
```json
{ "success": true }
```

### Возможные ошибки
- **403** — `{ "error": "Invalid id_token" }`

---

## `GET /api/v1/auth/telegram/link`
`requireAuth`. Старт линковки Telegram к текущему пользователю. Если уже привязан — `{ "error": "Telegram already linked" }`. Создаёт PKCE-пару и хранит `(state, verifier, user_id)` в in-memory stateStore.

### Тело ответа
```json
{ "url": "https://oauth.telegram.org/auth?client_id=...&redirect_uri=...&response_type=code&scope=openid+profile&state=...&code_challenge=...&code_challenge_method=S256", "verifier": "..." }
```

### Поля ответа
| Поле | Описание | Тип |
| ---- | -------- | --- |
| `url` | URL авторизации Telegram | `string` |
| `verifier` | PKCE code verifier (возвращается клиенту) | `string` |

### Возможные ошибки
- **200**, но с полем `error` — уже привязан
- **401** — `{ "error": "Unauthorized" }`

---

## `DELETE /api/v1/auth/telegram/link`
`requireAuth`. Отвязка Telegram: удаляется только локальная строка `telegramAuth` пользователя.

### Тело ответа
```json
{ "success": true }
```

### Возможные ошибки
- **401** — `{ "error": "Unauthorized" }`

---