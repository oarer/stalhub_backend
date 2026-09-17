# Внутренний API

**Эндпоинты для внутренних сервисов (Discord-бот и заглушка уведомлений). Группа монтируется под префиксом `/api/v1/internal/...`. Вся аутентификация — заголовок `x-bot-secret`, равный значению env `DISCORD_BOT_SERVICE_JWT`; если env пуст или заголовок не совпадает — 401. Других способов аутентификации нет.**

---

## Общие сведения

- Гуард `botAuth` стоит на всех маршрутах `/internal/bot/*` (в `beforeHandle`) и возвращает **401** `{ "error": "Invalid bot secret" }`.
- Бот связывает Discord-гильдии с кланами (`botGuild`), находит клан по Discord-пользователю и управляет клановыми процессами: отсутствия, снапшоты этапов войны, гостевые приглашения.
- `POST /bot/notify` — заглушка без побочных эффектов: проверяет секрет и эхо-возвращает payload.

---

## `POST /api/v1/internal/bot/notify`
**Заглушка.** Проверяет `x-bot-secret` против `DISCORD_BOT_SERVICE_JWT` и просто возвращает тело обратно. Никаких побочных эффектов нет. Реальные бот-эндпоинты живут в `./bot` (ниже).

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `channel_id` | id канала, куда должно было уйти сообщение | `string` | Да |
| `message` | текст сообщения | `string` | Да |

### Заголовки
| Заголовок | Описание | Обязательный |
| --------- | -------- | :----------: |
| `x-bot-secret` | секрет бот-сервиса (`DISCORD_BOT_SERVICE_JWT`) | Да |

### Тело ответа
```json
{
	"ok": true,
	"payload": {
		"channel_id": "123456789",
		"message": "some message"
	}
}
```

### Возможные ошибки
- **401** — `{ "error": "Invalid bot secret" }`

---

## `GET /api/v1/internal/bot/clans`
`x-bot-secret`. Поиск кланов по подстроке. Ищет по `id`, `name` и `tag` (case-insensitive), сортирует по имени, максимум 20 записей.

### Параметры (query)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `q` | подстрока поиска | `string` | Нет |

### Тело ответа
```json
{
	"clans": [
		{
			"id": "clan-id",
			"name": "Имя клана",
			"tag": "TAG",
			"region": "RU",
			"status": "ACTIVE",
			"member_count": 3
		}
	]
}
```

### Поля `clans[]`
| Поле | Описание | Тип |
| ---- | -------- | --- |
| `id` | id клана | `string` |
| `name` | название | `string` |
| `tag` | тег | `string` |
| `region` | регион | `string` |
| `status` | статус (например `ACTIVE`) | `string` |
| `member_count` | число участников | `number` |

### Возможные ошибки
- **401** — `{ "error": "Invalid bot secret" }`

---

## `GET /api/v1/internal/bot/users/:discord_id/clan`
`x-bot-secret`. Клан активного кланового профиля Discord-пользователя (по связанной записи `discordAuth`).

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `discord_id` | Discord id пользователя | `string` | Да |

### Тело ответа
```json
{
	"clan": {
		"id": "clan-id",
		"name": "Имя клана",
		"tag": "TAG",
		"region": "RU",
		"status": "ACTIVE"
	}
}
```

`clan` может быть `null` (нет привязки Discord или нет активного кланового профиля).

### Возможные ошибки
- **401** — `{ "error": "Invalid bot secret" }`

---

## `GET /api/v1/internal/bot/clans/:clan_id/squads`
`x-bot-secret`. Отряды клана.

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `clan_id` | id клана | `string` | Да |

### Тело ответа
```json
{
	"clan": { "id": "clan-id", "name": "...", "tag": "TAG", "region": "RU" },
	"squads": []
}
```

### Возможные ошибки
- **401** — `{ "error": "Invalid bot secret" }`
- Несуществующий клан — тело `{ "error": "Clan not found" }` (статус при этом не меняется, остаётся 200)

---

## `GET /api/v1/internal/bot/clans/:clan_id/absences`
`x-bot-secret`. Отсутствия в клане на дату. Дата по умолчанию — сегодня по МСК (`mskDate()`).

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `clan_id` | id клана | `string` | Да |

### Параметры (query)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `date` | дата в формате `ГГГГ-ММ-ДД` | `string` | Нет |

### Тело ответа
```json
{
	"clan_id": "clan-id",
	"date": "2026-09-11",
	"absences": []
}
```

### Возможные ошибки
- **401** — `{ "error": "Invalid bot secret" }`

---

## `POST /api/v1/internal/bot/absences`
`x-bot-secret`. Создание/обновление отсутствия участника клана (upsert). Участник определяется по Discord id через `discordAuth`.

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `discord_id` | Discord id участника | `string` | Да |
| `clan_id` | id клана | `string` | Да |
| `date` | дата `ГГГГ-ММ-ДД` | `string` | Да |
| `events` | массив событий отсутствия | `array` | Да |
| `events[].event_type` | тип события | `string` | Да |
| `events[].stages` | номера этапов | `number[]` | Нет |
| `note` | примечание | `string` | Нет |

### Тело ответа
```json
{ "absence": { } }
```
(форма объекта `absence` — из сервиса `absenceService.upsert`)

### Возможные ошибки
- **400** — `{ "error": "<сообщение сервиса>" }` — ошибка валидации бизнес-логики
- **403** — `{ "error": "You are not a member of this clan" }` — активный клановый профиль не относится к `clan_id`
- **404** — `{ "error": "Discord account not linked. Link it in profile settings." }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `DELETE /api/v1/internal/bot/absences`
`x-bot-secret`. Удаление отсутствия участника.

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `discord_id` | Discord id участника | `string` | Да |
| `clan_id` | id клана | `string` | Да |
| `date` | дата `ГГГГ-ММ-ДД` | `string` | Да |

### Тело ответа
Форма ответа из `absenceService.remove`.

### Возможные ошибки
- **400** — `{ "error": "<сообщение сервиса>" }`
- **404** — `{ "error": "Discord account not linked" }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `POST /api/v1/internal/bot/screenshots`
`x-bot-secret`. Загрузка снапшота этапа войны (multipart). Приватный слот этапа определяется по текущему времени, если `date`/`stage`/`type` опущены (`detectStageSlot`); сессия этапа на группу клан/регион/тип/этап/дату либо создаётся, либо переиспользуется. Допустимые типы файлов: `image/png`, `image/jpeg`, `image/webp`.

### Параметры (body, multipart)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `clan_id` | id клана | `string` | Да |
| `file` | изображение (png/jpeg/webp) | `file` | Да |
| `type` | тип этапа (enum `StageType`) | `string` | Нет |
| `stage` | номер этапа, `minimum: 1` | `number` | Нет |
| `date` | дата `ГГГГ-ММ-ДД` | `string` | Нет |

### Тело ответа
```json
{
	"session": { },
	"screenshot": { },
	"detected": { }
}
```

### Поля ответа
| Поле | Описание | Тип |
| ---- | -------- | --- |
| `session` | сессия этапа (`analyticsService.getOrCreateStageSession`) | `object` |
| `screenshot` | сохранённый снапшот (`analyticsService.addScreenshot`) | `object` |
| `detected` | детектированный слот (`detectStageSlot`) | `object` |

### Возможные ошибки
- **400** — `{ "error": "Не удалось определить этап по времени. Укажите день (date: ГГГГ-ММ-ДД), этап (stage) и тип (type).", "required": ["date", "stage", "type"], "detected": { } }` — слот не удалось вычислить
- **400** — `{ "error": "<сообщение сервиса>" }` — ошибка создания сессии или сохранения скриншота
- **404** — `{ "error": "Clan not found" }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `GET /api/v1/internal/bot/stage`
`x-bot-secret`. Текущий и следующий слот этапа по времени (по умолчанию — сейчас).

### Параметры (query)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `at` | дата/время для расчёта (парсится `new Date(at)`) | `string` | Нет |

### Тело ответа
```json
{
	"detected": { },
	"next": { }
}
```

### Поля ответа
| Поле | Описание | Тип |
| ---- | -------- | --- |
| `detected` | слот этапа в указанный момент | `object`/`null` |
| `next` | следующий слот этапа | `object`/`null` |

### Возможные ошибки
- **401** — `{ "error": "Invalid bot secret" }`

---

## `POST /api/v1/internal/bot/invites/claim`
`x-bot-secret`. Привязка кода приглашения к гостевому аккаунту пользователя. Гостевой аккаунт идентифицируется как `discord:<discord_id>`.

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `discord_id` | Discord id пользователя | `string` | Да |
| `code` | код приглашения, `minLength: 1` | `string` | Да |

### Тело ответа
Форма ответа из `clanInviteService.claim`.

### Возможные ошибки
- **400** — `{ "error": "<сообщение сервиса>" }`
- **404** — `{ "error": "Discord account not linked. Link it in profile settings." }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `POST /api/v1/internal/bot/invites`
`x-bot-secret`. Создание гостевого аккаунта (`discord:<discord_id>`) — throwaway локального пользователя, привязанного к клану.

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `clan_id` | id клана | `string` | Да |
| `discord_id` | Discord id гостя | `string` | Да |
| `nickname` | никнейм гостя, `minLength: 1` | `string` | Да |

### Тело ответа
Форма ответа из `clanInviteService.createGuestAccount`.

### Возможные ошибки
- **400** — `{ "error": "<сообщение сервиса>" }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `DELETE /api/v1/internal/bot/invites/:id`
`x-bot-secret`. Отзыв приглашения по id.

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `id` | id приглашения | `number` | Да |

### Тело ответа
Форма ответа из `clanInviteService.revoke`.

### Возможные ошибки
- **400** — `{ "error": "<сообщение сервиса>" }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `DELETE /api/v1/internal/bot/invites/guest/discord/:discord_id`
`x-bot-secret`. Удаление гостевого аккаунта. В одной транзакции: удаляется клановый профиль, отвязывается clan-мемберский слот (`clan_member.user_id → null`), удаляются приглашения и сам пользователь.

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `discord_id` | Discord id гостя | `string` | Да |

### Тело ответа
```json
{ "ok": true }
```

### Возможные ошибки
- **400** — `{ "error": "This user is not a clan guest" }` — у пользователя нет приглашения
- **404** — `{ "error": "Discord account not linked" }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `POST /api/v1/internal/bot/link`
`x-bot-secret`. Привязка Discord-гильдии к клану через одноразовый токен `botLinkState` (проверяется `expires_at`). В одной транзакции: токен удаляется и гильдия upsert'ится в `botGuild`.

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `guild_id` | Discord id гильдии | `string` | Да |
| `token` | одноразовый link-токен | `string` | Да |
| `discord_id` | Discord id, кто связал | `string` | Да |

### Тело ответа
```json
{
	"guild": {
		"guild_id": "...",
		"clan_id": "clan-id",
		"allowed_role_id": null,
		"publish_time": null,
		"publish_channel_id": null,
		"stages_channel_id": null,
		"linked_by": "discord-id",
		"clan": { "id": "...", "name": "...", "tag": "TAG", "region": "RU" }
	}
}
```

### Возможные ошибки
- **400** — `{ "error": "Invalid or expired link token" }`
- **404** — `{ "error": "Clan not found" }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `GET /api/v1/internal/bot/guilds`
`x-bot-secret`. Все связанные гильдии с кланами, отсортированные по `created_at` (по возрастанию).

### Тело ответа
```json
{
	"guilds": [
		{
			"guild_id": "...",
			"clan_id": "clan-id",
			"allowed_role_id": null,
			"publish_time": "...",
			"publish_channel_id": null,
			"stages_channel_id": null,
			"linked_by": "...",
			"clan": { "id": "...", "name": "...", "tag": "TAG", "region": "RU" }
		}
	]
}
```

### Возможные ошибки
- **401** — `{ "error": "Invalid bot secret" }`

---

## `GET /api/v1/internal/bot/guilds/:guild_id`
`x-bot-secret`. Одна гильдия с кланом.

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `guild_id` | Discord id гильдии | `string` | Да |

### Тело ответа
```json
{ "guild": { "guild_id": "...", "clan_id": "clan-id", "clan": { } } }
```

### Возможные ошибки
- **404** — `{ "error": "Guild not linked" }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `PATCH /api/v1/internal/bot/guilds/:guild_id`
`x-bot-secret`. Обновление настроек гильдии. Значения полей можно сбрасывать в `null` или задавать строкой.

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `guild_id` | Discord id гильдии | `string` | Да |

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `allowed_role_id` | id разрешённой роли | `string`/`null` | Нет |
| `publish_time` | время публикации | `string`/`null` | Нет |
| `publish_channel_id` | id канала публикации | `string`/`null` | Нет |
| `stages_channel_id` | id канала этапов | `string`/`null` | Нет |

### Тело ответа
```json
{ "guild": { "guild_id": "...", "clan_id": "clan-id", "clan": { } } }
```

### Возможные ошибки
- **404** — `{ "error": "Guild not linked" }`
- **401** — `{ "error": "Invalid bot secret" }`

---

## `DELETE /api/v1/internal/bot/guilds/:guild_id`
`x-bot-secret`. Отвязка гильдии (удаление строки из `botGuild`).

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `guild_id` | Discord id гильдии | `string` | Да |

### Тело ответа
```json
{ "success": true }
```

### Возможные ошибки
- **401** — `{ "error": "Invalid bot secret" }`

---